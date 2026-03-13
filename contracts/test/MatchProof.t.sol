// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/protocol/MatchProof.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MatchProofTest is Test {
    MatchProof public impl;
    MatchProof public matchProof;

    Account oracleAccount;
    Account agent1;
    Account agent2;
    Account nonOracle;
    address owner;

    function setUp() public {
        owner = address(this);

        oracleAccount = makeAccount("oracle");
        agent1 = makeAccount("agent1");
        agent2 = makeAccount("agent2");
        nonOracle = makeAccount("nonOracle");

        // Deploy implementation + UUPS proxy
        impl = new MatchProof();
        bytes memory initData = abi.encodeCall(MatchProof.initialize, (owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        matchProof = MatchProof(address(proxy));

        // Set oracle to our test oracle account
        matchProof.setOracle(oracleAccount.addr);
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
        bytes memory sig = _signResult(result, oracleAccount.key);

        vm.expectEmit(true, true, false, true);
        emit MatchProof.ResultSubmitted(1, agent1.addr, result.timestamp);

        matchProof.submitResult(result, sig);

        MatchProof.MarioKartResult memory stored = matchProof.getResult(1);
        assertEq(stored.finalPositions[0], 1);
        assertEq(stored.agents[0], agent1.addr);
        assertTrue(matchProof.submitted(1));
    }

    function test_rejectDuplicateSubmission() public {
        MatchProof.MarioKartResult memory result = _makeResult(2);
        bytes memory sig = _signResult(result, oracleAccount.key);

        matchProof.submitResult(result, sig);

        vm.expectRevert("MatchProof: already submitted");
        matchProof.submitResult(result, sig);
    }

    function test_rejectNonOracleSignature() public {
        MatchProof.MarioKartResult memory result = _makeResult(3);
        bytes memory sig = _signResult(result, nonOracle.key);

        vm.expectRevert("MatchProof: invalid oracle signature");
        matchProof.submitResult(result, sig);
    }

    function test_rejectZeroMatchId() public {
        MatchProof.MarioKartResult memory result = _makeResult(0);
        bytes memory sig = _signResult(result, oracleAccount.key);

        vm.expectRevert("MatchProof: invalid matchId");
        matchProof.submitResult(result, sig);
    }

    function test_getResultRevertsIfNotSubmitted() public {
        vm.expectRevert("MatchProof: not submitted");
        matchProof.getResult(999);
    }

    function test_setOracle() public {
        matchProof.setOracle(agent1.addr);
        assertEq(matchProof.oracle(), agent1.addr);
    }

    function test_setOracleRevertsForNonOwner() public {
        vm.prank(agent1.addr);
        vm.expectRevert();
        matchProof.setOracle(agent1.addr);
    }

    function test_oracleDefaultsToOwner() public {
        // Deploy fresh contract — oracle should be initialOwner
        MatchProof freshImpl = new MatchProof();
        bytes memory initData = abi.encodeCall(MatchProof.initialize, (address(this)));
        ERC1967Proxy proxy = new ERC1967Proxy(address(freshImpl), initData);
        MatchProof fresh = MatchProof(address(proxy));
        assertEq(fresh.oracle(), address(this));
    }

    function test_upgradeByOwner() public {
        MatchProof newImpl = new MatchProof();
        matchProof.upgradeToAndCall(address(newImpl), "");
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
        bytes memory sig = _signResult(result, oracleAccount.key);

        matchProof.submitResult(result, sig);
        assertTrue(matchProof.submitted(matchId));
    }
}
