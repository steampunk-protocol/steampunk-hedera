/**
 * setup-hedera.ts
 *
 * Creates Hedera network resources required by the AI Agent Arcade:
 *   1. STEAM fungible token via HTS (8 decimals, 10M initial supply)
 *   2. Agent NFT collection via HTS (non-fungible, 0 initial supply)
 *   3. HCS topic for match results
 *   4. HCS topic for matchmaker coordination
 *
 * Outputs all created IDs to console and persists them to scripts/hedera-ids.json.
 *
 * Required env vars (loaded from ../.env):
 *   HEDERA_OPERATOR_ID  — e.g. 0.0.1234
 *   HEDERA_OPERATOR_KEY — DER-encoded or raw hex 32-byte private key
 *   HEDERA_NETWORK      — "testnet" | "mainnet" (default: testnet)
 */

import "dotenv/config";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TopicCreateTransaction,
  Hbar,
} from "@hashgraph/sdk";

// Load .env from project root (one level up from scripts/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
import { config } from "dotenv";
config({ path: envPath });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const operatorId = AccountId.fromString(requireEnv("HEDERA_OPERATOR_ID"));
  const rawKey = requireEnv("HEDERA_OPERATOR_KEY").replace(/^0x/, "");
  const operatorKey = PrivateKey.fromStringECDSA(rawKey);
  const network = (process.env.HEDERA_NETWORK ?? "testnet") as "testnet" | "mainnet";

  const client =
    network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  console.log(`\n=== Steampunk Hedera Setup ===`);
  console.log(`Network : ${network}`);
  console.log(`Operator: ${operatorId.toString()}\n`);

  // ── 1. STEAM fungible token ───────────────────────────────────────────────
  console.log("Creating STEAM fungible token...");
  const steamTokenTx = await new TokenCreateTransaction()
    .setTokenName("SteamPunk Token")
    .setTokenSymbol("STEAM")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(8)
    // 10,000,000 STEAM with 8 decimal places
    .setInitialSupply(1_000_000_00000000)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId)
    .setAdminKey(operatorKey.publicKey)
    .setSupplyKey(operatorKey.publicKey)
    .setFreezeKey(operatorKey.publicKey)
    .setWipeKey(operatorKey.publicKey)
    .freezeWith(client)
    .sign(operatorKey);

  const steamTokenReceipt = await (await steamTokenTx.execute(client)).getReceipt(client);
  const steamTokenId = steamTokenReceipt.tokenId!;
  console.log(`  STEAM token ID  : ${steamTokenId.toString()}`);
  console.log(
    `  STEAM EVM addr  : 0x${steamTokenId.toSolidityAddress()}`
  );

  // ── 2. Agent NFT collection ───────────────────────────────────────────────
  console.log("\nCreating Agent NFT collection...");
  const agentNftTx = await new TokenCreateTransaction()
    .setTokenName("SteamPunk Agent")
    .setTokenSymbol("SAGENT")
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId)
    .setAdminKey(operatorKey.publicKey)
    .setSupplyKey(operatorKey.publicKey)
    .setFreezeKey(operatorKey.publicKey)
    .setWipeKey(operatorKey.publicKey)
    .freezeWith(client)
    .sign(operatorKey);

  const agentNftReceipt = await (await agentNftTx.execute(client)).getReceipt(client);
  const agentNftTokenId = agentNftReceipt.tokenId!;
  console.log(`  Agent NFT token ID : ${agentNftTokenId.toString()}`);
  console.log(
    `  Agent NFT EVM addr : 0x${agentNftTokenId.toSolidityAddress()}`
  );

  // ── 3. HCS topic: match results ───────────────────────────────────────────
  console.log("\nCreating HCS match results topic...");
  const matchResultsTopicTx = await new TopicCreateTransaction()
    .setTopicMemo("steampunk-hedera:match-results")
    .setAdminKey(operatorKey.publicKey)
    .setSubmitKey(operatorKey.publicKey)
    .freezeWith(client)
    .sign(operatorKey);

  const matchResultsReceipt = await (
    await matchResultsTopicTx.execute(client)
  ).getReceipt(client);
  const matchResultsTopicId = matchResultsReceipt.topicId!;
  console.log(`  Match results topic: ${matchResultsTopicId.toString()}`);

  // ── 4. HCS topic: matchmaker ──────────────────────────────────────────────
  console.log("\nCreating HCS matchmaker topic...");
  const matchmakerTopicTx = await new TopicCreateTransaction()
    .setTopicMemo("steampunk-hedera:matchmaker")
    .setAdminKey(operatorKey.publicKey)
    .setSubmitKey(operatorKey.publicKey)
    .freezeWith(client)
    .sign(operatorKey);

  const matchmakerReceipt = await (
    await matchmakerTopicTx.execute(client)
  ).getReceipt(client);
  const matchmakerTopicId = matchmakerReceipt.topicId!;
  console.log(`  Matchmaker topic   : ${matchmakerTopicId.toString()}`);

  // ── Persist IDs ───────────────────────────────────────────────────────────
  const ids = {
    network,
    steamTokenId: steamTokenId.toString(),
    steamTokenEvmAddress: `0x${steamTokenId.toSolidityAddress()}`,
    agentNftTokenId: agentNftTokenId.toString(),
    agentNftEvmAddress: `0x${agentNftTokenId.toSolidityAddress()}`,
    matchResultsTopicId: matchResultsTopicId.toString(),
    matchmakerTopicId: matchmakerTopicId.toString(),
    createdAt: new Date().toISOString(),
  };

  const outputPath = resolve(__dirname, "hedera-ids.json");
  writeFileSync(outputPath, JSON.stringify(ids, null, 2));

  console.log(`\n=== Done ===`);
  console.log(`IDs written to: ${outputPath}`);
  console.log(JSON.stringify(ids, null, 2));

  client.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
