/**
 * deploy-contracts.ts
 *
 * Deploys Steampunk Hedera smart contracts via Foundry (forge),
 * targeting the Hedera testnet JSON-RPC Relay.
 *
 * Reads hedera-ids.json to inject HTS token addresses as env vars
 * so Deploy.s.sol can reference them during deployment.
 *
 * Required env vars (loaded from ../.env):
 *   HEDERA_TESTNET_RPC — e.g. https://testnet.hashio.io/api
 *   DEPLOYER_KEY       — private key (hex, no 0x prefix required)
 *
 * Optional:
 *   HEDERA_MAINNET_RPC — used when HEDERA_NETWORK=mainnet
 *   HEDERA_NETWORK     — "testnet" | "mainnet" (default: testnet)
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

interface HederaIds {
  steamTokenEvmAddress?: string;
  agentNftEvmAddress?: string;
  matchResultsTopicId?: string;
  matchmakerTopicId?: string;
  [key: string]: unknown;
}

function loadHederaIds(): HederaIds {
  const idsPath = resolve(__dirname, "hedera-ids.json");
  if (!existsSync(idsPath)) {
    console.warn(
      "Warning: hedera-ids.json not found. Run `npm run setup` first to create HTS tokens and HCS topics."
    );
    return {};
  }
  return JSON.parse(readFileSync(idsPath, "utf-8")) as HederaIds;
}

function run(cmd: string, env: NodeJS.ProcessEnv): void {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, {
    stdio: "inherit",
    env,
  });
}

async function main() {
  const network = (process.env.HEDERA_NETWORK ?? "testnet") as
    | "testnet"
    | "mainnet";

  const rpcUrl =
    network === "mainnet"
      ? requireEnv("HEDERA_MAINNET_RPC")
      : requireEnv("HEDERA_TESTNET_RPC");

  const deployerKey = requireEnv("DEPLOYER_KEY");

  const projectRoot = resolve(__dirname, "..");
  const deployScript = resolve(projectRoot, "contracts/script/Deploy.s.sol");

  if (!existsSync(deployScript)) {
    throw new Error(
      `Deploy script not found at ${deployScript}. Ensure contracts/script/Deploy.s.sol exists.`
    );
  }

  const hederaIds = loadHederaIds();

  console.log(`\n=== Deploy Contracts to Hedera (${network}) ===`);
  console.log(`RPC URL : ${rpcUrl}`);
  if (hederaIds.steamTokenEvmAddress) {
    console.log(`STEAM   : ${hederaIds.steamTokenEvmAddress}`);
  }
  if (hederaIds.agentNftEvmAddress) {
    console.log(`AgentNFT: ${hederaIds.agentNftEvmAddress}`);
  }
  if (hederaIds.matchResultsTopicId) {
    console.log(`HCS Match Results: ${hederaIds.matchResultsTopicId}`);
  }

  // Build environment for forge — inject HTS addresses so Deploy.s.sol can read them
  const forgeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Forge uses these to read via vm.envAddress() / vm.envString() in the script
    STEAM_TOKEN_ADDRESS: hederaIds.steamTokenEvmAddress ?? "",
    AGENT_NFT_ADDRESS: hederaIds.agentNftEvmAddress ?? "",
    MATCH_RESULTS_TOPIC_ID: hederaIds.matchResultsTopicId ?? "",
    MATCHMAKER_TOPIC_ID: hederaIds.matchmakerTopicId ?? "",
  };

  const forgeCmd = [
    "forge script",
    `contracts/script/Deploy.s.sol`,
    `--rpc-url ${rpcUrl}`,
    `--private-key ${deployerKey}`,
    "--broadcast",
    "--slow", // Hedera finality is ~3-5s; --slow adds delay between txs
    "-vvv",
  ].join(" ");

  try {
    run(forgeCmd, forgeEnv);
    console.log("\n=== Deployment complete ===");
    console.log(
      "Verify contracts on Hashscan: https://hashscan.io/testnet/dashboard"
    );
  } catch (err) {
    console.error("\nDeployment failed.");
    console.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
