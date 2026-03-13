// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/protocol/MatchProof.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MatchProofTest is Test {
    MatchProof public impl;
    MatchProof public matchProof;

    Account agent1;
    Account agent2;
    Account agent3;
    address owner;

    function setUp() public {
        owner = address(this);

        // Create named accounts with known private keys for signing
        agent1 = makeAccount("agent1");
        agent2 = makeAccount("agent2");
        agent3 = makeAccount("agent3");

        // Deploy implementation + UUPS proxy
        impl = new MatchProof();
        bytes memory initData = abi.encodeCall(MatchProof.initialize, (owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        matchProof = MatchProof(address(proxy));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _makeResult(uint256 matchId) internal view returns (MatchProof.MarioKartResult memory) {
        address[4] memory agents = [agent1.addr, agent2.addr, address(0), address(0)];
        uint8[4] memory positions = [1, 2, 0, 0];
        uint32[4] memory times = [uint32(120_000), 125_000, 0, 0];
        return MatchProof.MarioKartResult({
            agents: agents,
            finalPositions: positions,
            finishTimes: times,
            trackId: 1,
            matchId: matchId,
            timestamp: block.timestamp
        });
    }

    function _signResult(MatchProof.MarioKartResult memory result, uint256 privateKey)
        internal view returns (bytes memory)
    {
        bytes32 digest = matchProof.getResultHash(result);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── Tests ───────────────────────────────────────────────────────────────

    function test_submitValidResult() public {
        MatchProof.MarioKartResult memory result = _makeResult(1);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signResult(result, agent1.key);
        sigs[1] = _signResult(result, agent2.key);

        vm.expectEmit(true, true, false, true);
        emit MatchProof.ResultSubmitted(1, agent1.addr, result.timestamp);

        matchProof.submitResult(result, sigs);

        MatchProof.MarioKartResult memory stored = matchProof.getResult(1);
        assertEq(stored.finalPositions[0], 1);
        assertEq(stored.agents[0], agent1.addr);
        assertTrue(matchProof.submitted(1));
    }

    function test_rejectDuplicateSubmission() public {
        MatchProof.MarioKartResult memory result = _makeResult(2);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signResult(result, agent1.key);
        sigs[1] = _signResult(result, agent2.key);

        matchProof.submitResult(result, sigs);

        vm.expectRevert("MatchProof: already submitted");
        matchProof.submitResult(result, sigs);
    }

    function test_rejectInvalidSignature() public {
        MatchProof.MarioKartResult memory result = _makeResult(3);
        bytes[] memory sigs = new bytes[](2);
        // agent3 signs slot 0 — wrong signer
        sigs[0] = _signResult(result, agent3.key);
        sigs[1] = _signResult(result, agent2.key);

        vm.expectRevert("MatchProof: invalid signature");
        matchProof.submitResult(result, sigs);
    }

    function test_rejectTooFewSignatures() public {
        MatchProof.MarioKartResult memory result = _makeResult(4);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signResult(result, agent1.key);

        vm.expectRevert("MatchProof: need at least 2 signatures");
        matchProof.submitResult(result, sigs);
    }

    function test_rejectZeroMatchId() public {
        MatchProof.MarioKartResult memory result = _makeResult(0);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signResult(result, agent1.key);
        sigs[1] = _signResult(result, agent2.key);

        vm.expectRevert("MatchProof: invalid matchId");
        matchProof.submitResult(result, sigs);
    }

    function test_getResultRevertsIfNotSubmitted() public {
        vm.expectRevert("MatchProof: not submitted");
        matchProof.getResult(999);
    }

    function test_upgradeByOwner() public {
        MatchProof newImpl = new MatchProof();
        matchProof.upgradeToAndCall(address(newImpl), "");
        // proxy still works after upgrade
        assertFalse(matchProof.submitted(1));
    }

    function test_upgradeRevertsForNonOwner() public {
        MatchProof newImpl = new MatchProof();
        vm.prank(agent1.addr);
        vm.expectRevert();
        matchProof.upgradeToAndCall(address(newImpl), "");
    }

    function testFuzz_submitResult_uniqueMatchIds(uint256 matchId) public {
        vm.assume(matchId > 0 && matchId < type(uint128).max);

        MatchProof.MarioKartResult memory result = _makeResult(matchId);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signResult(result, agent1.key);
        sigs[1] = _signResult(result, agent2.key);

        matchProof.submitResult(result, sigs);
        assertTrue(matchProof.submitted(matchId));
    }
}
