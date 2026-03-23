#!/usr/bin/env npx tsx
// ============================================================================
// Place Bet — Bettor places a STEAM prediction on a match agent
// Uses Hedera SDK for tx signing (accounts use ED25519/ECDSA keys via SDK)
// ============================================================================

import { ethers } from "ethers";
import {
  Client,
  AccountId,
  PrivateKey,
  ContractExecuteTransaction,
  ContractId,
  TokenAssociateTransaction,
  AccountAllowanceApproveTransaction,
  Hbar,
} from "@hashgraph/sdk";
import { readFileSync } from "fs";
import { join, resolve } from "path";

// --- Constants ---
const STEAM_TOKEN_ID = "0.0.8187171";
const PREDICTION_POOL_EVM = "0xbf5071FcD7d9fECc5522298865070B4508BB23cC";
const HASHSCAN_BASE = "https://hashscan.io/testnet/transaction";
const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";
const STEAM_DECIMALS = 8;

function matchIdToUint256(matchId: string): bigint {
  return BigInt(ethers.solidityPackedKeccak256(["string"], [matchId]));
}

function parseArgs(): { dir: string; matchId: string; agent: string; amount: number } {
  const args = process.argv.slice(2);
  let dir = ".";
  let matchId = "";
  let agent = "";
  let amount = 0;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir": dir = args[++i]; break;
      case "--match": matchId = args[++i]; break;
      case "--agent": agent = args[++i]; break;
      case "--amount": amount = parseFloat(args[++i]); break;
    }
  }

  if (!matchId || !agent || !amount) {
    console.error("Usage: npx tsx place-bet.ts --match <match_id> --agent <evm_addr> --amount <steam_amount>");
    process.exit(1);
  }

  return { dir: resolve(dir), matchId, agent, amount };
}

async function getBalanceViaMirror(accountId: string): Promise<bigint> {
  const url = `${MIRROR_BASE}/tokens/${STEAM_TOKEN_ID}/balances?account.id=${accountId}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.balances && data.balances.length > 0) {
    return BigInt(data.balances[0].balance);
  }
  return 0n;
}

// Convert EVM address to ContractId
function evmToContractId(evmAddr: string): ContractId {
  return ContractId.fromEvmAddress(0, 0, evmAddr);
}

async function main() {
  const { dir, matchId, agent, amount } = parseArgs();

  // Load .env.agents
  const envPath = join(dir, ".env.agents");
  let envContent: string;
  try {
    envContent = readFileSync(envPath, "utf-8");
  } catch {
    console.error(`Cannot read ${envPath}`);
    process.exit(1);
  }

  const env: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  const privateKeyHex = env.AGENT_PRIVATE_KEY;
  const bettorName = env.AGENT_NAME || "BETTOR";
  const accountId = env.AGENT_ACCOUNT_ID;
  if (!privateKeyHex || !accountId) {
    console.error("AGENT_PRIVATE_KEY and AGENT_ACCOUNT_ID required in .env.agents");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  PLACE BET — Agent Colosseum                    ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  Bettor:  ${bettorName}`);
  console.log(`  Account: ${accountId}`);
  console.log(`  Match:   ${matchId}`);
  console.log(`  Backing: ${agent}`);
  console.log(`  Amount:  ${amount} STEAM`);
  console.log("");

  const rawAmount = BigInt(Math.round(amount * 10 ** STEAM_DECIMALS));
  const matchUint256 = matchIdToUint256(matchId);
  console.log(`  Raw amt: ${rawAmount} (${STEAM_DECIMALS} decimals)`);
  console.log(`  Match#:  ${matchUint256}`);
  console.log("");

  // Check balance via mirror node
  const balance = await getBalanceViaMirror(accountId);
  console.log(`  STEAM balance: ${Number(balance) / 10 ** STEAM_DECIMALS}`);
  if (balance < rawAmount) {
    console.error(`  Insufficient STEAM. Have ${Number(balance) / 1e8}, need ${amount}`);
    process.exit(1);
  }

  // Setup Hedera client
  const client = Client.forTestnet();
  let privKey: PrivateKey;
  try {
    // Try ECDSA first (hex keys are typically ECDSA)
    privKey = PrivateKey.fromStringECDSA(privateKeyHex);
  } catch {
    try {
      privKey = PrivateKey.fromStringED25519(privateKeyHex);
    } catch {
      privKey = PrivateKey.fromString(privateKeyHex);
    }
  }
  client.setOperator(AccountId.fromString(accountId), privKey);

  // Resolve PredictionPool contract ID via mirror node
  const poolContractId = await resolveContractId(PREDICTION_POOL_EVM);
  console.log(`  Pool contract: ${poolContractId}`);

  // Step 1: Approve STEAM tokens to PredictionPool via HTS allowance
  console.log("\n[1/2] Approving STEAM spend via HTS allowance...");
  try {
    const approveTx = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        STEAM_TOKEN_ID,
        accountId,
        poolContractId.toString(),
        Number(rawAmount)
      )
      .setMaxTransactionFee(new Hbar(5));

    const approveResponse = await approveTx.execute(client);
    const approveReceipt = await approveResponse.getReceipt(client);
    console.log(`  Status: ${approveReceipt.status}`);
    console.log(`  Tx: ${HASHSCAN_BASE}/${approveResponse.transactionId}`);
  } catch (err: any) {
    console.error("  Approve failed:", err.message);
    process.exit(1);
  }

  // Step 2: Call placeBet on PredictionPool contract
  console.log("\n[2/2] Placing bet via contract call...");

  // Encode: placeBet(uint256 matchId, address agent, uint256 amount)
  const iface = new ethers.Interface([
    "function placeBet(uint256 matchId, address agent, uint256 amount)",
  ]);
  const callData = iface.encodeFunctionData("placeBet", [matchUint256, agent, rawAmount]);

  try {
    const contractTx = new ContractExecuteTransaction()
      .setContractId(poolContractId)
      .setGas(300000)
      .setFunctionParameters(Buffer.from(callData.slice(2), "hex"))
      .setMaxTransactionFee(new Hbar(10));

    const contractResponse = await contractTx.execute(client);
    const contractReceipt = await contractResponse.getReceipt(client);
    console.log(`  Status: ${contractReceipt.status}`);
    console.log(`  Tx: ${HASHSCAN_BASE}/${contractResponse.transactionId}`);
    console.log("  Bet placed!");
  } catch (err: any) {
    console.error("  Place bet failed:", err.message);
    process.exit(1);
  }

  console.log(`\n  Confirmed: ${amount} STEAM on ${agent}`);
  console.log(`\n  Watch: https://steampunk-hedera.vercel.app/matches/${matchId}`);
}

async function resolveContractId(evmAddr: string): Promise<string> {
  // Try mirror node to resolve EVM address to Hedera contract ID
  const addr = evmAddr.toLowerCase().replace("0x", "");
  const url = `${MIRROR_BASE}/contracts/${addr}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as any;
      return data.contract_id;
    }
  } catch {}
  // Fallback: try treating as account num in last bytes
  return ContractId.fromEvmAddress(0, 0, evmAddr).toString();
}

main().catch((err) => {
  console.error("Bet failed:", err.message || err);
  process.exit(1);
});
