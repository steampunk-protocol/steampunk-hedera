#!/usr/bin/env node
/**
 * HCS publisher — submits a message to a Hedera HCS topic.
 *
 * Usage:
 *   node hcs-publisher.js <topic_id> <message_json>
 *
 * Environment variables:
 *   HEDERA_OPERATOR_ID  — Hedera account ID (e.g. "0.0.12345")
 *   HEDERA_OPERATOR_KEY — ECDSA or ED25519 private key (DER hex or PEM)
 *   HEDERA_NETWORK      — "testnet" (default) or "mainnet"
 *
 * Prints JSON to stdout: { "sequenceNumber": <N> }
 * Exits with code 1 on failure (stderr contains error).
 */

const {
  Client,
  AccountId,
  PrivateKey,
  TopicId,
  TopicMessageSubmitTransaction,
} = require("@hashgraph/sdk");

async function main() {
  const [, , topicIdArg, messageJsonArg] = process.argv;

  if (!topicIdArg || !messageJsonArg) {
    console.error("Usage: node hcs-publisher.js <topic_id> <message_json>");
    process.exit(1);
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK || "testnet";

  if (!operatorId || !operatorKey) {
    console.error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set");
    process.exit(1);
  }

  // Build client
  let client;
  if (network === "mainnet") {
    client = Client.forMainnet();
  } else {
    client = Client.forTestnet();
  }

  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromStringDer(operatorKey)
  );

  const topicId = TopicId.fromString(topicIdArg);

  // Submit message
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(messageJsonArg)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const sequenceNumber = receipt.topicSequenceNumber.toNumber();

  console.log(JSON.stringify({ sequenceNumber }));

  client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("hcs-publisher error:", err.message || err);
  process.exit(1);
});
