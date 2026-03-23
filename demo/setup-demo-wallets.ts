#!/usr/bin/env npx tsx
// ============================================================================
// Demo Wallet Setup — Creates fighter + bettor accounts on Hedera testnet
// ============================================================================
// Creates 5 accounts, funds with HBAR + STEAM, writes .env.agents files.
// Run: npx tsx demo/setup-demo-wallets.ts
// ============================================================================

import {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  TransferTransaction,
  Hbar,
  TokenAssociateTransaction,
  AccountId,
  TokenId,
} from "@hashgraph/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const OPERATOR_ID = AccountId.fromString("0.0.7152196");
const OPERATOR_KEY = PrivateKey.fromStringECDSA(
  "5e51c9941963e578292c4b6e20423a15355e24b20211a24a77b138d507290f80"
);
const STEAM_TOKEN = TokenId.fromString("0.0.8187171");
const HBAR_PER_ACCOUNT = 5;
const STEAM_PER_ACCOUNT = 500_00000000n; // 500 STEAM * 10^8

interface AgentSpec {
  name: string;
  dir: string;
  model: string;
  role: "fighter" | "bettor";
}

const AGENTS: AgentSpec[] = [
  { name: "FIGHTER-APOLLO", dir: "fighter-apollo", model: "claude-opus", role: "fighter" },
  { name: "FIGHTER-ARES", dir: "fighter-ares", model: "gpt-4o", role: "fighter" },
  { name: "BETTOR-ALPHA", dir: "bettor-alpha", model: "spectator", role: "bettor" },
  { name: "BETTOR-BETA", dir: "bettor-beta", model: "spectator", role: "bettor" },
  { name: "BETTOR-GAMMA", dir: "bettor-gamma", model: "spectator", role: "bettor" },
];

async function main() {
  const client = Client.forTestnet();
  client.setOperator(OPERATOR_ID, OPERATOR_KEY);

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  DEMO WALLET SETUP — Hedera Testnet             ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Operator: ${OPERATOR_ID}`);
  console.log(`STEAM Token: ${STEAM_TOKEN}`);
  console.log(`Creating ${AGENTS.length} accounts...\n`);

  const results: {
    name: string;
    accountId: string;
    evmAddress: string;
    privateKey: string;
    role: string;
  }[] = [];

  for (const agent of AGENTS) {
    console.log(`--- ${agent.name} ---`);

    // 1. Generate key + create account with initial HBAR
    const newKey = PrivateKey.generateECDSA();
    console.log(`  Generating ECDSA key...`);

    const createTx = await new AccountCreateTransaction()
      .setKey(newKey.publicKey)
      .setInitialBalance(new Hbar(HBAR_PER_ACCOUNT))
      .execute(client);
    const createReceipt = await createTx.getReceipt(client);
    const newAccountId = createReceipt.accountId!;
    console.log(`  Account created: ${newAccountId}`);

    // 2. Associate STEAM token
    console.log(`  Associating STEAM token...`);
    const assocTx = await new TokenAssociateTransaction()
      .setAccountId(newAccountId)
      .setTokenIds([STEAM_TOKEN])
      .freezeWith(client);
    const signedAssoc = await assocTx.sign(newKey);
    await (await signedAssoc.execute(client)).getReceipt(client);

    // 3. Transfer STEAM tokens
    console.log(`  Transferring 500 STEAM...`);
    const steamTx = await new TransferTransaction()
      .addTokenTransfer(STEAM_TOKEN, OPERATOR_ID, -Number(STEAM_PER_ACCOUNT))
      .addTokenTransfer(STEAM_TOKEN, newAccountId, Number(STEAM_PER_ACCOUNT))
      .execute(client);
    await steamTx.getReceipt(client);

    // 4. Derive EVM address
    const accountNum = newAccountId.num.toString();
    const evmAddress = "0x" + BigInt(accountNum).toString(16).padStart(40, "0");

    // 5. Write .env.agents
    const envContent = [
      `# Agent: ${agent.name} — HCS-10 identity on Hedera testnet`,
      `AGENT_NAME=${agent.name}`,
      `AGENT_ACCOUNT_ID=${newAccountId.toString()}`,
      `AGENT_PRIVATE_KEY=${newKey.toStringRaw()}`,
      `AGENT_EVM_ADDRESS=${evmAddress}`,
      `AGENT_MODEL=${agent.model}`,
      `AGENT_ROLE=${agent.role}`,
      `STEAM_TOKEN_ID=${STEAM_TOKEN.toString()}`,
      "",
    ].join("\n");

    const dirPath = join(__dirname, agent.dir);
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, ".env.agents"), envContent);
    console.log(`  Wrote ${agent.dir}/.env.agents`);

    results.push({
      name: agent.name,
      accountId: newAccountId.toString(),
      evmAddress,
      privateKey: newKey.toStringRaw(),
      role: agent.role,
    });

    console.log(`  Done.\n`);
  }

  // Summary table
  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                                               ║");
  console.log("╠══════════════════╦════════════════╦════════════════════════════════════════╣");
  console.log("║ Name             ║ Account ID     ║ EVM Address                            ║");
  console.log("╠══════════════════╬════════════════╬════════════════════════════════════════╣");
  for (const r of results) {
    const name = r.name.padEnd(16);
    const acct = r.accountId.padEnd(14);
    console.log(`║ ${name} ║ ${acct} ║ ${r.evmAddress} ║`);
  }
  console.log("╚══════════════════╩════════════════╩════════════════════════════════════════╝");
  console.log("");
  console.log("Each account has:");
  console.log(`  - ${HBAR_PER_ACCOUNT} HBAR (for gas)`);
  console.log(`  - 500 STEAM (for betting/wagering)`);
  console.log("");
  console.log("Next steps:");
  console.log("  Fighters:  cd demo/fighter-apollo && ../run-agent.sh");
  console.log("  Bettors:   npx tsx demo/place-bet.ts --dir demo/bettor-alpha --match <match_id> --agent <evm_addr> --amount 50");

  client.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
