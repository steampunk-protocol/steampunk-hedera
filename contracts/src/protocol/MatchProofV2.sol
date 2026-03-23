// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MatchProofV2
 * @notice Non-upgradeable match result attestation. Hedera-compatible.
 */
contract MatchProofV2 is EIP712, Ownable {
    using ECDSA for bytes32;

    struct MarioKartResult {
        address[4] agents;
        uint8[4] finalPositions;
        uint32[4] finishTimes;
        uint8 trackId;
        uint256 matchId;
        uint256 timestamp;
    }

    bytes32 private constant RESULT_TYPEHASH = keccak256(
        "MarioKartResult(address[4] agents,uint8[4] finalPositions,uint32[4] finishTimes,uint8 trackId,uint256 matchId,uint256 timestamp)"
    );

    address public oracle;
    mapping(uint256 => MarioKartResult) public results;
    mapping(uint256 => bool) public submitted;

    event ResultSubmitted(uint256 indexed matchId, address indexed winner, uint256 timestamp);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    constructor(address initialOwner) EIP712("SteamPunk", "1") Ownable(initialOwner) {
        oracle = initialOwner;
    }

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function submitResult(MarioKartResult calldata result, bytes calldata signature) external {
        require(!submitted[result.matchId], "already submitted");
        require(result.matchId > 0, "invalid matchId");

        bytes32 digest = _hashTypedDataV4(_hashResult(result));
        address signer = digest.recover(signature);
        require(signer == oracle, "invalid oracle signature");

        results[result.matchId] = result;
        submitted[result.matchId] = true;

        emit ResultSubmitted(result.matchId, _findWinner(result), result.timestamp);
    }

    function getResult(uint256 matchId) external view returns (MarioKartResult memory) {
        require(submitted[matchId], "not submitted");
        return results[matchId];
    }

    function getResultHash(MarioKartResult calldata result) external view returns (bytes32) {
        return _hashTypedDataV4(_hashResult(result));
    }

    function _hashResult(MarioKartResult calldata result) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            RESULT_TYPEHASH,
            keccak256(abi.encode(result.agents)),
            keccak256(abi.encode(result.finalPositions)),
            keccak256(abi.encode(result.finishTimes)),
            result.trackId,
            result.matchId,
            result.timestamp
        ));
    }

    function _findWinner(MarioKartResult memory result) internal pure returns (address) {
        for (uint256 i = 0; i < 4; i++) {
            if (result.finalPositions[i] == 1) return result.agents[i];
        }
        return result.agents[0];
    }
}
