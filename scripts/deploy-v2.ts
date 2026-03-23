/**
 * Deploy V2 (non-upgradeable) contracts to Hedera testnet via SDK.
 * Bypasses JSON-RPC relay gas issues by using native Hedera ContractCreateTransaction.
 */
import {
  Client, PrivateKey, AccountId, ContractCreateFlow,
  ContractFunctionParameters,
} from "@hashgraph/sdk";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const OPERATOR_ID = AccountId.fromString("0.0.7152196");
const OPERATOR_KEY = PrivateKey.fromStringECDSA(
  "5e51c9941963e578292c4b6e20423a15355e24b20211a24a77b138d507290f80"
);
const STEAM_EVM = "0x00000000000000000000000000000000007ced23";
// Deployer EVM address
const OWNER_EVM = "0xf8647E347df35bd65d0bc4dF62C4135a537980f9";

interface DeployResult {
  name: string;
  contractId: string;
  evmAddress: string;
}

async function deployContract(
  client: any,
  name: string,
  bytecodeHex: string,
  constructorParams: ContractFunctionParameters,
  gas: number = 2000000,
): Promise<DeployResult> {
  console.log(`\nDeploying ${name}...`);

  const bytecode = bytecodeHex.startsWith("0x") ? bytecodeHex : "0x" + bytecodeHex;

  // ContractCreateFlow handles file upload + contract creation in one step
  const contractTx = await new ContractCreateFlow()
    .setBytecode(bytecode)
    .setGas(gas)
    .setConstructorParameters(constructorParams)
    .execute(client);
  const contractReceipt = await contractTx.getReceipt(client);
  const contractId = contractReceipt.contractId!;
  const evmAddress = contractId.toSolidityAddress();

  console.log(`  Contract ID: ${contractId}`);
  console.log(`  EVM Address: 0x${evmAddress}`);
  console.log(`  HashScan: https://hashscan.io/testnet/contract/${contractId}`);

  return { name, contractId: contractId.toString(), evmAddress: `0x${evmAddress}` };
}

function loadBytecode(contractName: string): string {
  const artPath = resolve(__dirname, `../contracts/out/${contractName}.sol/${contractName}.json`);
  const artifact = JSON.parse(readFileSync(artPath, "utf-8"));
  let bytecode = artifact.bytecode?.object || artifact.bytecode || "";
  if (bytecode.startsWith("0x")) bytecode = bytecode.slice(2);
  return bytecode;
}

async function main() {
  const client = Client.forTestnet();
  client.setOperator(OPERATOR_ID, OPERATOR_KEY);

  console.log("=== Deploy V2 Contracts to Hedera Testnet ===");
  console.log(`Operator: ${OPERATOR_ID}`);
  console.log(`STEAM Token: ${STEAM_EVM}`);
  console.log(`Owner: ${OWNER_EVM}`);

  // Helper to convert EVM address to Solidity bytes
  function evmToBytes(addr: string): Uint8Array {
    const hex = addr.startsWith("0x") ? addr.slice(2) : addr;
    return Buffer.from(hex.padStart(40, "0"), "hex");
  }

  // 1. MatchProofV2(address initialOwner)
  const mpBytecode = loadBytecode("MatchProofV2");
  const mpParams = new ContractFunctionParameters().addAddress(OWNER_EVM);
  const mp = await deployContract(client, "MatchProofV2", mpBytecode, mpParams, 3000000);

  // 2. WagerV2(address _token, address _arena, address initialOwner)
  const wgBytecode = loadBytecode("WagerV2");
  const wgParams = new ContractFunctionParameters()
    .addAddress(STEAM_EVM)
    .addAddress(OWNER_EVM)
    .addAddress(OWNER_EVM);
  const wg = await deployContract(client, "WagerV2", wgBytecode, wgParams, 3000000);

  // 3. PredictionPoolV2(address _token, address _arena, address initialOwner)
  const ppBytecode = loadBytecode("PredictionPoolV2");
  const ppParams = new ContractFunctionParameters()
    .addAddress(STEAM_EVM)
    .addAddress(OWNER_EVM)
    .addAddress(OWNER_EVM);
  const pp = await deployContract(client, "PredictionPoolV2", ppBytecode, ppParams, 3000000);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log(`MatchProofV2:      ${mp.evmAddress} (${mp.contractId})`);
  console.log(`WagerV2:           ${wg.evmAddress} (${wg.contractId})`);
  console.log(`PredictionPoolV2:  ${pp.evmAddress} (${pp.contractId})`);

  // Save to file
  const result = {
    matchProof: mp,
    wager: wg,
    predictionPool: pp,
    deployedAt: new Date().toISOString(),
  };
  const outPath = resolve(__dirname, "v2-contracts.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved to ${outPath}`);

  // Print env vars to update
  console.log("\n=== Update .env with these values ===");
  console.log(`MATCH_PROOF_ADDRESS=${mp.evmAddress}`);
  console.log(`WAGER_ADDRESS=${wg.evmAddress}`);
  console.log(`PREDICTION_POOL_ADDRESS=${pp.evmAddress}`);

  client.close();
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
