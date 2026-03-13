/**
 * register-agents.ts
 *
 * Registers AI agents as HCS-10 identities using @hashgraphonline/standards-sdk.
 * Each agent gets:
 *   - An HCS inbound topic (others post match invites here)
 *   - An HCS outbound topic (agent publishes state here)
 *   - An HCS-11 profile (agent metadata)
 *   - Registration with the HOL guarded registry
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, existsSync, readFileSync } from "fs";
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

interface AgentRegistration {
  name: string;
  accountId: string;
  privateKey: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  capabilities: string[];
  registeredAt: string;
}

interface AgentDef {
  name: string;
  description: string;
  capabilities: AIAgentCapability[];
  capabilityTags: string[];
}

const AGENT_DEFS: AgentDef[] = [
  {
    name: "Matchmaker",
    description:
      "Central matchmaking agent for AI Agent Arcade. Pairs agents for matches, coordinates wagers, and manages the game queue via HCS-10.",
    capabilities: [
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.WORKFLOW_AUTOMATION,
    ],
    capabilityTags: ["matchmaker", "queue-management"],
  },
  {
    name: "MarioAgent",
    description:
      "Autonomous AI agent competing in Mario Kart 64 matches on AI Agent Arcade (Steampunk Hedera)",
    capabilities: [
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.DATA_INTEGRATION,
    ],
    capabilityTags: ["mario-kart-64"],
  },
  {
    name: "LuigiAgent",
    description:
      "Autonomous AI agent competing in Mario Kart 64 matches on AI Agent Arcade (Steampunk Hedera)",
    capabilities: [
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.DATA_INTEGRATION,
    ],
    capabilityTags: ["mario-kart-64"],
  },
];

async function registerAgent(
  hcsClient: HCS10Client,
  def: AgentDef,
): Promise<AgentRegistration> {
  console.log(`\nRegistering agent: ${def.name}`);

  const builder = new AgentBuilder()
    .setName(def.name)
    .setDescription(def.description)
    .setCapabilities(def.capabilities)
    .setAgentType("autonomous")
    .setNetwork(
      (process.env.HEDERA_NETWORK ?? "testnet") as "testnet" | "mainnet",
    );

  const result = await hcsClient.createAndRegisterAgent(builder, {
    progressCallback: (data) => {
      console.log(`  [${data.stage}] ${data.message}`);
    },
  });

  if (!result.metadata) {
    throw new Error(`Agent registration failed for ${def.name}: no metadata returned`);
  }

  // Extract private key from all possible locations in the result object
  const privateKey =
    result.metadata.privateKey ??
    (result as any).privateKey ??
    (result as any).state?.privateKey ??
    (result as any).accountInfo?.privateKey ??
    "";

  if (!privateKey) {
    console.warn(`  WARNING: No private key returned for ${def.name}. Agent will use operator key.`);
    console.log(`  Result keys: ${Object.keys(result).join(", ")}`);
    console.log(`  Metadata keys: ${Object.keys(result.metadata).join(", ")}`);
  }

  const reg: AgentRegistration = {
    name: def.name,
    accountId: result.metadata.accountId,
    privateKey,
    inboundTopicId: result.metadata.inboundTopicId,
    outboundTopicId: result.metadata.outboundTopicId,
    profileTopicId: result.metadata.profileTopicId ?? "",
    capabilities: def.capabilityTags,
    registeredAt: new Date().toISOString(),
  };

  console.log(`  Account  : ${reg.accountId}`);
  console.log(`  Inbound  : ${reg.inboundTopicId}`);
  console.log(`  Outbound : ${reg.outboundTopicId}`);
  console.log(`  Profile  : ${reg.profileTopicId}`);

  return reg;
}

async function main() {
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY").replace(/^0x/, "");
  const network = (process.env.HEDERA_NETWORK ?? "testnet") as
    | "testnet"
    | "mainnet";

  const hcsClient = new HCS10Client({
    network,
    operatorId,
    operatorPrivateKey: operatorKey,
    keyType: "ecdsa",
    logLevel: "info",
  } as any);

  console.log(`\n=== HCS-10 Agent Registration ===`);
  console.log(`Network : ${network}`);
  console.log(`Operator: ${operatorId}`);

  const agents: AgentRegistration[] = [];

  for (const def of AGENT_DEFS) {
    const reg = await registerAgent(hcsClient, def);
    agents.push(reg);
  }

  // Write agent-ids.json
  const agentIds = { network, agents };
  const agentIdsPath = resolve(__dirname, "agent-ids.json");
  writeFileSync(agentIdsPath, JSON.stringify(agentIds, null, 2));

  // Merge into hedera-ids.json
  const hederaIdsPath = resolve(__dirname, "hedera-ids.json");
  let existingIds: Record<string, unknown> = {};
  if (existsSync(hederaIdsPath)) {
    existingIds = JSON.parse(readFileSync(hederaIdsPath, "utf-8"));
  }
  const merged = { ...existingIds, agentIds: agents };
  writeFileSync(hederaIdsPath, JSON.stringify(merged, null, 2));

  console.log(`\n=== Done ===`);
  console.log(`Agent IDs written to: ${agentIdsPath}`);
  console.log(JSON.stringify(agentIds, null, 2));
}

main().catch((err) => {
  console.error("Agent registration failed:", err);
  process.exit(1);
});
