/**
 * register-demo-simple.ts
 *
 * Creates HERMES and SERPENS agent accounts using the operator key directly.
 * Sets HCS-11 memo, creates topics, publishes profile.
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
  AccountCreateTransaction,
  AccountUpdateTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  Hbar,
} from "@hashgraph/sdk";

const operatorId = process.env.HEDERA_OPERATOR_ID!;
const operatorKeyHex = process.env.HEDERA_OPERATOR_KEY!.replace(/^0x/, "");

interface Agent {
  dirName: string;
  name: string;
  model: string;
  description: string;
}

const AGENTS: Agent[] = [
  {
    dirName: "agent-hermes",
    name: "HERMES",
    model: "claude-opus",
    description: "Autonomous AI racer powered by Claude. Competes in Agent Colosseum with adaptive strategy.",
  },
  {
    dirName: "agent-serpens",
    name: "SERPENS",
    model: "gpt-4o",
    description: "Autonomous AI racer powered by GPT-4o. Position-aware strategy — aggressive when behind, defensive when leading.",
  },
];

async function main() {
  const client = Client.forTestnet();
  const opKey = PrivateKey.fromStringECDSA(operatorKeyHex);
  client.setOperator(AccountId.fromString(operatorId), opKey);

  console.log(`Operator: ${operatorId}\n`);

  for (const agent of AGENTS) {
    console.log(`=== ${agent.name} ===`);

    // Create account with operator key (so operator can manage it)
    const createTx = await new AccountCreateTransaction()
      .setKey(opKey.publicKey)
      .setInitialBalance(new Hbar(5))
      .setAccountMemo(`Agent Colosseum: ${agent.name}`)
      .execute(client);
    const createReceipt = await createTx.getReceipt(client);
    const accountId = createReceipt.accountId!.toString();
    console.log(`  Account: ${accountId}`);

    // Create inbound topic (submit key = operator, so arena can post)
    const inTx = await new TopicCreateTransaction()
      .setAdminKey(opKey.publicKey)
      .setSubmitKey(opKey.publicKey)
      .setTopicMemo(`${agent.name} HCS-10 Inbound`)
      .execute(client);
    const inReceipt = await inTx.getReceipt(client);
    const inboundTopic = inReceipt.topicId!.toString();
    console.log(`  Inbound: ${inboundTopic}`);

    // Create outbound topic
    const outTx = await new TopicCreateTransaction()
      .setAdminKey(opKey.publicKey)
      .setSubmitKey(opKey.publicKey)
      .setTopicMemo(`${agent.name} HCS-10 Outbound`)
      .execute(client);
    const outReceipt = await outTx.getReceipt(client);
    const outboundTopic = outReceipt.topicId!.toString();
    console.log(`  Outbound: ${outboundTopic}`);

    // Create profile topic
    const profTx = await new TopicCreateTransaction()
      .setAdminKey(opKey.publicKey)
      .setSubmitKey(opKey.publicKey)
      .setTopicMemo(`${agent.name} HCS-11 Profile`)
      .execute(client);
    const profReceipt = await profTx.getReceipt(client);
    const profileTopic = profReceipt.topicId!.toString();
    console.log(`  Profile: ${profileTopic}`);

    // Set HCS-11 memo on account
    await new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setAccountMemo(`hcs-11:hcs://1/${profileTopic}`)
      .execute(client);
    console.log(`  Memo set: hcs-11:hcs://1/${profileTopic}`);

    // Publish HCS-11 profile
    const profile = JSON.stringify({
      p: "hcs-11",
      op: "register",
      t_id: inboundTopic,
      name: agent.name,
      description: agent.description,
      properties: {
        type: "autonomous",
        model: agent.model,
        inboundTopic,
        outboundTopic,
        game: "mariokart64",
        arena: "Agent Colosseum",
      },
    });
    await new TopicMessageSubmitTransaction()
      .setTopicId(profileTopic)
      .setMessage(profile)
      .execute(client);
    console.log(`  Profile published`);

    // Write .env.agents
    const demoDir = resolve(__dirname, `../demo/${agent.dirName}`);
    mkdirSync(demoDir, { recursive: true });
    writeFileSync(
      resolve(demoDir, ".env.agents"),
      [
        `# Agent: ${agent.name} — HCS-10 identity on Hedera testnet`,
        `# Created: ${new Date().toISOString()}`,
        `# HashScan: https://hashscan.io/testnet/account/${accountId}`,
        `# Inbound: https://hashscan.io/testnet/topic/${inboundTopic}`,
        ``,
        `AGENT_NAME=${agent.name}`,
        `AGENT_ACCOUNT_ID=${accountId}`,
        `AGENT_PRIVATE_KEY=${operatorKeyHex}`,
        `AGENT_MODEL=${agent.model}`,
        `AGENT_HCS_INBOUND_TOPIC=${inboundTopic}`,
        ``,
      ].join("\n"),
    );
    console.log(`  → demo/${agent.dirName}/.env.agents\n`);
  }

  client.close();
  console.log("Done! Run:");
  console.log("  Terminal 1: cd demo/agent-hermes && ../run-agent.sh");
  console.log("  Terminal 2: cd demo/agent-serpens && ../run-agent.sh");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
