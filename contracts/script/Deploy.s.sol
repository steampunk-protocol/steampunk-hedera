// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/protocol/MatchProof.sol";
import "../src/protocol/Wager.sol";
import "../src/protocol/PredictionPool.sol";

/**
 * @notice Deploy SteamPunk contracts to Hedera via JSON-RPC Relay.
 *
 * Prerequisites:
 *   - STEAM HTS token already created via scripts/setup-hedera.ts
 *   - STEAM_TOKEN_EVM_ADDRESS set to the HTS token's EVM address (0x000...0XXXXX)
 *
 * Usage (Hedera testnet):
 *   forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast
 *
 * Required env vars:
 *   PRIVATE_KEY              — deployer private key (hex, no 0x prefix)
 *   STEAM_TOKEN_EVM_ADDRESS  — HTS STEAM token EVM address
 *   ARENA_SERVER_ADDRESS     — (optional) arena server EVM address; defaults to deployer
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address arenaServer = vm.envOr("ARENA_SERVER_ADDRESS", deployer);

        // HTS STEAM token EVM address — created via setup-hedera.ts, NOT deployed here.
        // Format: 0x000000000000000000000000000000000XXXXXXX
        address steamToken = vm.envAddress("STEAM_TOKEN_EVM_ADDRESS");

        console2.log("Deployer:      ", deployer);
        console2.log("Arena server:  ", arenaServer);
        console2.log("STEAM token:   ", steamToken);

        vm.startBroadcast(deployerKey);

        // 1. MatchProof (UUPS proxy)
        MatchProof matchProofImpl = new MatchProof();
        ERC1967Proxy matchProofProxy = new ERC1967Proxy(
            address(matchProofImpl),
            abi.encodeCall(MatchProof.initialize, (deployer))
        );
        console2.log("MatchProof:    ", address(matchProofProxy));

        // 2. Wager (UUPS proxy)
        Wager wagerImpl = new Wager();
        ERC1967Proxy wagerProxy = new ERC1967Proxy(
            address(wagerImpl),
            abi.encodeCall(Wager.initialize, (steamToken, arenaServer, deployer))
        );
        console2.log("Wager:         ", address(wagerProxy));

        // 3. PredictionPool (UUPS proxy)
        PredictionPool poolImpl = new PredictionPool();
        ERC1967Proxy poolProxy = new ERC1967Proxy(
            address(poolImpl),
            abi.encodeCall(PredictionPool.initialize, (steamToken, arenaServer, deployer))
        );
        console2.log("PredictionPool:", address(poolProxy));

        vm.stopBroadcast();

        console2.log("\n--- Add these to your .env ---");
        console2.log("MATCH_PROOF_ADDRESS=", address(matchProofProxy));
        console2.log("WAGER_ADDRESS=", address(wagerProxy));
        console2.log("PREDICTION_POOL_ADDRESS=", address(poolProxy));
    }
}
