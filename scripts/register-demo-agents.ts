/**
 * register-demo-agents.ts
 *
 * Registers HERMES and SERPENS as HCS-10 agents for the demo.
 * Each gets a fresh Hedera account, inbound/outbound topics, and HCS-11 profile.
 * Outputs credentials to demo/agent-hermes/.env.agents and demo/agent-serpens/.env.agents
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import {
  HCS10Client,
  AgentBuilder,
  AIAgentCapability,
} from "@hashgraphonline/standards-sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

interface DemoAgent {
  dirName: string;
  name: string;
  model: string;
  description: string;
  capabilities: AIAgentCapability[];
}

const DEMO_AGENTS: DemoAgent[] = [
  {
    dirName: "agent-hermes",
    name: "HERMES",
    model: "claude-opus",
    description:
      "Autonomous AI racer powered by Claude. Competes in Agent Colosseum matches with adaptive strategy — reads game state and adjusts tactics every 5 seconds via the Strategy API.",
    capabilities: [
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.AUTONOMOUS_OPERATION,
      AIAgentCapability.DATA_INTEGRATION,
    ],
  },
  {
    dirName: "agent-serpens",
    name: "SERPENS",
    model: "gpt-4o",
    description:
      "Autonomous AI racer powered by GPT-4o. Competes in Agent Colosseum matches with position-aware strategy — aggressive when behind, defensive when leading.",
    capabilities: [
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.AUTONOMOUS_OPERATION,
      AIAgentCapability.DATA_INTEGRATION,
    ],
  },
];

async function main() {
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY").replace(/^0x/, "");
  const network = (process.env.HEDERA_NETWORK ?? "testnet") as "testnet" | "mainnet";

  const hcsClient = new HCS10Client({
    network,
    operatorId,
    operatorPrivateKey: operatorKey,
    keyType: "ecdsa",
    logLevel: "info",
  } as any);

  console.log(`\n=== Registering Demo Agents ===`);
  console.log(`Network : ${network}`);
  console.log(`Operator: ${operatorId}\n`);

  for (const agent of DEMO_AGENTS) {
    console.log(`--- Registering ${agent.name} ---`);

    const builder = new AgentBuilder()
      .setName(agent.name)
      .setDescription(agent.description)
      .setCapabilities(agent.capabilities)
      .setAgentType("autonomous")
      .setNetwork(network);

    const result = await hcsClient.createAndRegisterAgent(builder, {
      progressCallback: (data) => {
        console.log(`  [${data.stage}] ${data.message}`);
      },
    });

    if (!result.metadata) {
      throw new Error(`Registration failed for ${agent.name}`);
    }

    const privateKey =
      result.metadata.privateKey ??
      (result as any).privateKey ??
      (result as any).state?.privateKey ??
      operatorKey; // fallback to operator key

    const accountId = result.metadata.accountId;
    const inboundTopicId = result.metadata.inboundTopicId;

    console.log(`  Account : ${accountId}`);
    console.log(`  Inbound : ${inboundTopicId}`);
    console.log(`  Outbound: ${result.metadata.outboundTopicId}`);
    console.log(`  Profile : ${result.metadata.profileTopicId}`);
    console.log(`  Key     : ${privateKey ? "YES" : "USING OPERATOR"}`);

    // Write .env.agents to demo workspace
    const demoDir = resolve(__dirname, `../demo/${agent.dirName}`);
    mkdirSync(demoDir, { recursive: true });

    const envContent = [
      `# Agent: ${agent.name} — registered on Hedera testnet`,
      `# Account created: ${new Date().toISOString()}`,
      ``,
      `AGENT_NAME=${agent.name}`,
      `AGENT_ACCOUNT_ID=${accountId}`,
      `AGENT_PRIVATE_KEY=${privateKey}`,
      `AGENT_MODEL=${agent.model}`,
      `AGENT_HCS_INBOUND_TOPIC=${inboundTopicId}`,
      ``,
    ].join("\n");

    writeFileSync(resolve(demoDir, ".env.agents"), envContent);
    console.log(`  Wrote: demo/${agent.dirName}/.env.agents\n`);
  }

  console.log("=== Done ===");
  console.log("Test with:");
  console.log("  Terminal 1: cd demo/agent-hermes && ../run-agent.sh");
  console.log("  Terminal 2: cd demo/agent-serpens && ../run-agent.sh");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
