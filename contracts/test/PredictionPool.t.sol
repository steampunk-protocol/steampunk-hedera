// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/protocol/PredictionPool.sol";
import "../src/mock/MockSTEAM.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract PredictionPoolTest is Test {
    PredictionPool public pool;
    MockSTEAM public token;

    address owner = address(this);
    address arena = makeAddr("arena");
    address agent1 = makeAddr("agent1");
    address agent2 = makeAddr("agent2");
    address bettor1 = makeAddr("bettor1");
    address bettor2 = makeAddr("bettor2");

    uint256 constant BET = 50e8;

    function setUp() public {
        token = new MockSTEAM(owner);

        PredictionPool impl = new PredictionPool();
        bytes memory initData = abi.encodeCall(PredictionPool.initialize, (address(token), arena, owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        pool = PredictionPool(address(proxy));

        token.mint(bettor1, 1000e8);
        token.mint(bettor2, 1000e8);
        vm.prank(bettor1); token.approve(address(pool), type(uint256).max);
        vm.prank(bettor2); token.approve(address(pool), type(uint256).max);
    }

    function _agents() internal view returns (address[] memory agents) {
        agents = new address[](2);
        agents[0] = agent1;
        agents[1] = agent2;
    }

    function _createPool(uint256 matchId) internal {
        vm.prank(arena);
        pool.createPool(matchId, _agents());
    }

    // ─── Tests ───────────────────────────────────────────────────────────────

    function test_createPool() public {
        _createPool(1);
        // Pool has dynamic array — verify via agentTotals (starts at 0)
        assertEq(pool.agentTotals(1, agent1), 0);
        assertEq(pool.agentTotals(1, agent2), 0);
    }

    function test_placeBet() public {
        _createPool(1);
        vm.prank(bettor1);
        vm.expectEmit(true, true, true, true);
        emit PredictionPool.BetPlaced(1, bettor1, agent1, BET);
        pool.placeBet(1, agent1, BET);

        assertEq(pool.agentTotals(1, agent1), BET);
        assertEq(pool.bets(1, bettor1, agent1), BET);
    }

    function test_claimWinnings() public {
        _createPool(1);
        vm.prank(bettor1); pool.placeBet(1, agent1, BET); // bets on winner
        vm.prank(bettor2); pool.placeBet(1, agent2, BET); // bets on loser

        vm.prank(arena); pool.lockPool(1);
        vm.prank(arena); pool.settlePool(1, agent1);

        uint256 before = token.balanceOf(bettor1);
        vm.prank(bettor1); pool.claimWinnings(1);

        // bettor1 holds 100% of agent1 pool (50), total=100, fee=2.5 → payout=97.5
        uint256 totalPool = BET * 2;
        uint256 fee = (totalPool * 250) / 10000;
        uint256 expected = totalPool - fee;
        assertEq(token.balanceOf(bettor1), before + expected);
    }

    function test_rejectBetOnLockedPool() public {
        _createPool(1);
        vm.prank(arena); pool.lockPool(1);
        vm.prank(bettor1);
        vm.expectRevert("PredictionPool: not open");
        pool.placeBet(1, agent1, BET);
    }

    function test_rejectDoubleClaimWinnings() public {
        _createPool(1);
        vm.prank(bettor1); pool.placeBet(1, agent1, BET);
        vm.prank(arena); pool.lockPool(1);
        vm.prank(arena); pool.settlePool(1, agent1);
        vm.prank(bettor1); pool.claimWinnings(1);
        vm.prank(bettor1);
        vm.expectRevert("PredictionPool: already claimed");
        pool.claimWinnings(1);
    }

    function test_rejectClaimWithNoBet() public {
        _createPool(1);
        vm.prank(arena); pool.lockPool(1);
        vm.prank(arena); pool.settlePool(1, agent1);
        vm.prank(bettor2);
        vm.expectRevert("PredictionPool: no winning bet");
        pool.claimWinnings(1);
    }

    function test_ownerCanSetFee() public {
        pool.setFeeBps(500);
        assertEq(pool.feeBps(), 500);
    }

    function test_rejectFeeTooHigh() public {
        vm.expectRevert("PredictionPool: fee too high");
        pool.setFeeBps(1001);
    }

    function test_upgradeByOwner() public {
        PredictionPool newImpl = new PredictionPool();
        pool.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgradeRevertsForNonOwner() public {
        PredictionPool newImpl = new PredictionPool();
        vm.prank(bettor1);
        vm.expectRevert();
        pool.upgradeToAndCall(address(newImpl), "");
    }

    function testFuzz_placeBet_totalAccumulates(uint96 amount1, uint96 amount2) public {
        vm.assume(amount1 > 0 && amount2 > 0);
        token.mint(bettor1, uint256(amount1) + uint256(amount2));
        vm.prank(bettor1); token.approve(address(pool), type(uint256).max);

        _createPool(2);
        vm.prank(bettor1); pool.placeBet(2, agent1, amount1);
        vm.prank(bettor1); pool.placeBet(2, agent1, amount2);

        assertEq(pool.agentTotals(2, agent1), uint256(amount1) + uint256(amount2));
    }
}
