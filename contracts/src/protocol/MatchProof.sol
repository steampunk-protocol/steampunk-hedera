// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title MatchProof
 * @notice Game-agnostic oracle-signed match result attestation.
 * @dev UUPS upgradeable. Stores EIP-712 signed match results.
 *      Arena oracle signs results; single trusted oracle for MVP.
 *      On Hedera: match results are also published to an HCS topic for
 *      immutable ordering proof (see arena/hcs/ for HCS-10 publishing).
 */
contract MatchProof is Initializable, EIP712Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using ECDSA for bytes32;

    struct MarioKartResult {
        address[4] agents;       // up to 4 competitors (zero-padded)
        uint8[4] finalPositions; // 1st=1, 2nd=2, etc. 0 = DNF
        uint32[4] finishTimes;   // milliseconds; 0 = DNF
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __EIP712_init("SteamPunk", "1");
        __Ownable_init(initialOwner);
        oracle = initialOwner;
    }

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    /**
     * @notice Submit an oracle-signed match result (MVP — single trusted oracle).
     * @param result    The MarioKartResult struct.
     * @param signature Oracle's EIP-712 signature over the result.
     */
    function submitResult(MarioKartResult calldata result, bytes calldata signature) external {
        require(!submitted[result.matchId], "MatchProof: already submitted");
        require(result.matchId > 0, "MatchProof: invalid matchId");

        bytes32 digest = _hashTypedDataV4(_hashResult(result));
        address signer = digest.recover(signature);
        require(signer == oracle, "MatchProof: invalid oracle signature");

        results[result.matchId] = result;
        submitted[result.matchId] = true;

        emit ResultSubmitted(result.matchId, _findWinner(result), result.timestamp);
    }

    function getResult(uint256 matchId) external view returns (MarioKartResult memory) {
        require(submitted[matchId], "MatchProof: not submitted");
        return results[matchId];
    }

    function getResultHash(MarioKartResult calldata result) external view returns (bytes32) {
        return _hashTypedDataV4(_hashResult(result));
    }

    // ─── Internal ────────────────────────────────────────────────────────────

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

    function _countAgents(address[4] memory agents) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < 4; i++) {
            if (agents[i] != address(0)) count++;
        }
    }

    function _findWinner(MarioKartResult memory result) internal pure returns (address) {
        for (uint256 i = 0; i < 4; i++) {
            if (result.finalPositions[i] == 1) return result.agents[i];
        }
        return result.agents[0];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
