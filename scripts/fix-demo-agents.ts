/**
 * fix-demo-agents.ts
 *
 * Sets HCS-11 profile memo on accounts created by register-demo-agents.ts,
 * creates HCS-11 profile topics, and registers with HOL guarded registry.
 * Then creates SERPENS the same way.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import {
  AccountId,
  PrivateKey,
  Client,
  AccountUpdateTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";

import {
  HCS10Client,
  AgentBuilder,
  AIAgentCapability,
} from "@hashgraphonline/standards-sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing: ${name}`);
  return value;
}

interface AgentSetup {
  dirName: string;
  name: string;
  model: string;
  description: string;
}

async function createFullAgent(
  operatorId: string,
  operatorKeyHex: string,
  agent: AgentSetup,
): Promise<void> {
  const network = "testnet";
  console.log(`\n=== Creating ${agent.name} ===`);

  const hcsClient = new HCS10Client({
    network,
    operatorId,
    operatorPrivateKey: operatorKeyHex,
    keyType: "ecdsa",
    logLevel: "warn",
  } as any);

  // Use the SDK's full flow but handle errors gracefully
  const builder = new AgentBuilder()
    .setName(agent.name)
    .setDescription(agent.description)
    .setCapabilities([
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.AUTONOMOUS_OPERATION,
    ])
    .setAgentType("autonomous")
    .setNetwork(network);

  try {
    const result = await hcsClient.createAndRegisterAgent(builder, {
      progressCallback: (data) => {
        console.log(`  [${data.stage}] ${data.message}`);
      },
    });

    const meta = result.metadata!;
    const privateKey =
      meta.privateKey ??
      (result as any).privateKey ??
      operatorKeyHex;

    console.log(`  Account : ${meta.accountId}`);
    console.log(`  Inbound : ${meta.inboundTopicId}`);
    console.log(`  Outbound: ${meta.outboundTopicId}`);
    console.log(`  Profile : ${meta.profileTopicId}`);

    // Write .env.agents
    const demoDir = resolve(__dirname, `../demo/${agent.dirName}`);
    mkdirSync(demoDir, { recursive: true });
    writeFileSync(
      resolve(demoDir, ".env.agents"),
      [
        `# Agent: ${agent.name} — HCS-10 identity on Hedera testnet`,
        `# Created: ${new Date().toISOString()}`,
        `# Account: ${meta.accountId}`,
        `# Inbound Topic: ${meta.inboundTopicId}`,
        ``,
        `AGENT_NAME=${agent.name}`,
        `AGENT_ACCOUNT_ID=${meta.accountId}`,
        `AGENT_PRIVATE_KEY=${privateKey}`,
        `AGENT_MODEL=${agent.model}`,
        `AGENT_HCS_INBOUND_TOPIC=${meta.inboundTopicId}`,
        ``,
      ].join("\n"),
    );
    console.log(`  Wrote: demo/${agent.dirName}/.env.agents`);
  } catch (err: any) {
    // If profile/registry fails, still try to save what we have
    console.error(`  Error: ${err.message}`);
    console.log(`  Attempting manual profile setup...`);

    // Manual approach: create topics + set memo directly
    const client = Client.forTestnet();
    const opKey = PrivateKey.fromStringECDSA(operatorKeyHex);
    client.setOperator(AccountId.fromString(operatorId), opKey);

    // Create account
    const { AccountCreateTransaction } = await import("@hashgraph/sdk");
    const newKey = PrivateKey.generateECDSA();
    const createTx = await new AccountCreateTransaction()
      .setKey(newKey.publicKey)
      .setInitialBalance(10)
      .execute(client);
    const createReceipt = await createTx.getReceipt(client);
    const accountId = createReceipt.accountId!.toString();
    console.log(`  Created account: ${accountId}`);

    // Create inbound topic
    const inTx = await new TopicCreateTransaction()
      .setAdminKey(newKey.publicKey)
      .setSubmitKey(newKey.publicKey)
      .execute(client);
    const inReceipt = await inTx.getReceipt(client);
    const inboundTopic = inReceipt.topicId!.toString();
    console.log(`  Inbound topic: ${inboundTopic}`);

    // Create outbound topic
    const outTx = await new TopicCreateTransaction()
      .setAdminKey(newKey.publicKey)
      .setSubmitKey(newKey.publicKey)
      .execute(client);
    const outReceipt = await outTx.getReceipt(client);
    const outboundTopic = outReceipt.topicId!.toString();
    console.log(`  Outbound topic: ${outboundTopic}`);

    // Create profile topic
    const profTx = await new TopicCreateTransaction()
      .setAdminKey(newKey.publicKey)
      .setSubmitKey(newKey.publicKey)
      .execute(client);
    const profReceipt = await profTx.getReceipt(client);
    const profileTopic = profReceipt.topicId!.toString();

    // Set HCS-11 memo on account
    const newClient = Client.forTestnet();
    newClient.setOperator(AccountId.fromString(accountId), newKey);
    await new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setAccountMemo(`hcs-11:hcs://1/${profileTopic}`)
      .execute(newClient);
    console.log(`  Set HCS-11 memo: hcs-11:hcs://1/${profileTopic}`);

    // Write profile to topic
    const profile = JSON.stringify({
      type: "ai-agent",
      name: agent.name,
      description: agent.description,
      inboundTopic: inboundTopic,
      outboundTopic: outboundTopic,
      agentType: "autonomous",
    });
    await new TopicMessageSubmitTransaction()
      .setTopicId(profileTopic)
      .setMessage(profile)
      .execute(newClient);
    console.log(`  Published profile to ${profileTopic}`);

    // Write .env.agents
    const demoDir = resolve(__dirname, `../demo/${agent.dirName}`);
    mkdirSync(demoDir, { recursive: true });
    writeFileSync(
      resolve(demoDir, ".env.agents"),
      [
        `# Agent: ${agent.name} — HCS-10 identity on Hedera testnet`,
        `# Created: ${new Date().toISOString()}`,
        `# Account: ${accountId}`,
        `# Inbound: ${inboundTopic} | Outbound: ${outboundTopic} | Profile: ${profileTopic}`,
        ``,
        `AGENT_NAME=${agent.name}`,
        `AGENT_ACCOUNT_ID=${accountId}`,
        `AGENT_PRIVATE_KEY=${newKey.toStringRaw()}`,
        `AGENT_MODEL=${agent.model}`,
        `AGENT_HCS_INBOUND_TOPIC=${inboundTopic}`,
        ``,
      ].join("\n"),
    );
    console.log(`  Wrote: demo/${agent.dirName}/.env.agents`);
    newClient.close();
    client.close();
  }
}

async function main() {
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY").replace(/^0x/, "");

  const agents: AgentSetup[] = [
    {
      dirName: "agent-hermes",
      name: "HERMES",
      model: "claude-opus",
      description:
        "Autonomous AI racer powered by Claude. Competes in Agent Colosseum with adaptive strategy — adjusts tactics based on race position every 5 seconds.",
    },
    {
      dirName: "agent-serpens",
      name: "SERPENS",
      model: "gpt-4o",
      description:
        "Autonomous AI racer powered by GPT-4o. Competes in Agent Colosseum with position-aware strategy — aggressive when behind, defensive when leading.",
    },
  ];

  for (const agent of agents) {
    await createFullAgent(operatorId, operatorKey, agent);
  }

  console.log("\n=== All agents registered ===");
  console.log("Demo:");
  console.log("  Terminal 1: cd demo/agent-hermes && ../run-agent.sh");
  console.log("  Terminal 2: cd demo/agent-serpens && ../run-agent.sh");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
