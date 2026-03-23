#!/usr/bin/env node
/**
 * Contract caller using viem — lightweight, fast Hedera JSON-RPC compatible.
 *
 * Usage: node contract-caller.js <action> [args...]
 *
 * Env: PRIVATE_KEY, RPC_URL, STEAM_TOKEN_EVM_ADDRESS
 */

const { createWalletClient, createPublicClient, http, parseAbi, defineChain } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL || "https://testnet.hashio.io/api"] } },
});

const KEY = process.env.PRIVATE_KEY || process.env.ARENA_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY || process.env.DEPLOYER_KEY;
if (!KEY) { console.error(JSON.stringify({ ok: false, error: "No private key" })); process.exit(1); }

const account = privateKeyToAccount(KEY.startsWith("0x") ? KEY : `0x${KEY}`);
const client = createWalletClient({ account, chain: hedera, transport: http() });
const pub = createPublicClient({ chain: hedera, transport: http() });

const STEAM = process.env.STEAM_TOKEN_EVM_ADDRESS || "0x00000000000000000000000000000000007ced23";

const poolAbi = parseAbi([
  "function createPool(uint256 matchId, address[] agents)",
  "function lockPool(uint256 matchId)",
  "function settlePool(uint256 matchId, address winner)",
]);

const wagerAbi = parseAbi([
  "function createMatch(uint256 matchId, address[] agents, uint256 wagerAmount)",
  "function depositFor(uint256 matchId, address agent)",
  "function settle(uint256 matchId, address winner)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

async function send(addr, abi, fn, args) {
  const hash = await client.writeContract({ address: addr, abi, functionName: fn, args, gas: 400000n });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60000 });
  if (receipt.status !== "success") throw new Error(`Reverted: ${hash}`);
  return hash;
}

async function main() {
  const [,, action, ...args] = process.argv;

  switch (action) {
    case "createPool": {
      const [addr, matchId, ...agents] = args;
      const tx = await send(addr, poolAbi, "createPool", [BigInt(matchId), agents]);
      console.log(JSON.stringify({ ok: true, tx, action }));
      break;
    }
    case "lockPool": {
      const [addr, matchId] = args;
      const tx = await send(addr, poolAbi, "lockPool", [BigInt(matchId)]);
      console.log(JSON.stringify({ ok: true, tx, action }));
      break;
    }
    case "settlePool": {
      const [addr, matchId, winner] = args;
      const tx = await send(addr, poolAbi, "settlePool", [BigInt(matchId), winner]);
      console.log(JSON.stringify({ ok: true, tx, action }));
      break;
    }
    case "createWager": {
      const [addr, matchId, agent1, agent2, amountRaw] = args;
      const tx = await send(addr, wagerAbi, "createMatch", [BigInt(matchId), [agent1, agent2], BigInt(amountRaw)]);
      console.log(JSON.stringify({ ok: true, tx, action }));
      break;
    }
    case "approveAndDeposit": {
      const [wagerAddr, matchId, agent1, agent2, amountRaw] = args;
      // STEAM allowance is pre-approved via HTS AccountAllowanceApproveTransaction
      // Skip ERC20 approve — go straight to depositFor
      const d1 = await send(wagerAddr, wagerAbi, "depositFor", [BigInt(matchId), agent1]);
      const d2 = await send(wagerAddr, wagerAbi, "depositFor", [BigInt(matchId), agent2]);
      console.log(JSON.stringify({ ok: true, tx: d2, action, deposits: [d1, d2] }));
      break;
    }
    case "settleWager": {
      const [addr, matchId, winner] = args;
      const tx = await send(addr, wagerAbi, "settle", [BigInt(matchId), winner]);
      console.log(JSON.stringify({ ok: true, tx, action }));
      break;
    }
    default:
      console.error(JSON.stringify({ ok: false, error: `Unknown: ${action}` }));
      process.exit(1);
  }
}

main().catch(e => {
  console.error(JSON.stringify({ ok: false, error: (e.message || String(e)).slice(0, 300), action: process.argv[2] }));
  process.exit(1);
});
