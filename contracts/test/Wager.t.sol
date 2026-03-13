// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/protocol/Wager.sol";
import "../src/mock/MockSTEAM.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract WagerTest is Test {
    Wager public wager;
    MockSTEAM public token;

    address owner = address(this);
    address arena = makeAddr("arena");
    address agent1 = makeAddr("agent1");
    address agent2 = makeAddr("agent2");

    uint256 constant WAGER = 100e8;

    function setUp() public {
        token = new MockSTEAM(owner);

        Wager impl = new Wager();
        bytes memory initData = abi.encodeCall(Wager.initialize, (address(token), arena, owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        wager = Wager(address(proxy));

        token.mint(agent1, 1000e8);
        token.mint(agent2, 1000e8);
        vm.prank(agent1); token.approve(address(wager), type(uint256).max);
        vm.prank(agent2); token.approve(address(wager), type(uint256).max);
    }

    function _agents() internal view returns (address[] memory agents) {
        agents = new address[](2);
        agents[0] = agent1;
        agents[1] = agent2;
    }

    function _createAndDeposit(uint256 matchId) internal {
        vm.prank(arena);
        wager.createMatch(matchId, _agents(), WAGER);
        vm.prank(agent1); wager.deposit(matchId);
        vm.prank(agent2); wager.deposit(matchId);
    }

    // ─── Tests ───────────────────────────────────────────────────────────────

    function test_createMatch() public {
        address[] memory agents = _agents();
        vm.prank(arena);
        vm.expectEmit(true, false, false, true);
        emit Wager.MatchCreated(1, agents, WAGER);
        wager.createMatch(1, agents, WAGER);

        // Struct has dynamic array — can't destructure; check matchId via deposited sentinel
        // Verify pending: agent1 not yet deposited → status still pending
        assertFalse(wager.deposited(1, agent1));
    }

    function test_depositTransitionsToActive() public {
        _createAndDeposit(1);
        // Both deposited → contract marked active internally; verify via token balance
        assertEq(token.balanceOf(address(wager)), WAGER * 2);
        assertTrue(wager.deposited(1, agent1));
        assertTrue(wager.deposited(1, agent2));
    }

    function test_settleTransfersPrizeToWinner() public {
        _createAndDeposit(1);
        uint256 balanceBefore = token.balanceOf(agent1);

        vm.prank(arena);
        vm.expectEmit(true, true, false, true);
        emit Wager.MatchSettled(1, agent1, WAGER * 2);
        wager.settle(1, agent1);

        assertEq(token.balanceOf(agent1), balanceBefore + WAGER * 2);
        assertEq(token.balanceOf(address(wager)), 0);
    }

    function test_cancelRefundsAgents() public {
        vm.prank(arena);
        wager.createMatch(2, _agents(), WAGER);
        vm.prank(agent1); wager.deposit(2);

        uint256 before1 = token.balanceOf(agent1);
        vm.prank(arena);
        wager.cancel(2);

        assertEq(token.balanceOf(agent1), before1 + WAGER);
    }

    function test_rejectNonArenaCreateMatch() public {
        vm.prank(agent1);
        vm.expectRevert("Wager: only arena");
        wager.createMatch(1, _agents(), WAGER);
    }

    function test_rejectDoubleDeposit() public {
        vm.prank(arena); wager.createMatch(1, _agents(), WAGER);
        vm.prank(agent1); wager.deposit(1);
        vm.prank(agent1);
        vm.expectRevert("Wager: already deposited");
        wager.deposit(1);
    }

    function test_rejectSettleBeforeActive() public {
        vm.prank(arena); wager.createMatch(1, _agents(), WAGER);
        vm.prank(agent1); wager.deposit(1); // only one deposit → still pending
        vm.prank(arena);
        vm.expectRevert("Wager: not active");
        wager.settle(1, agent1);
    }

    function test_ownerCanUpdateArena() public {
        address newArena = makeAddr("newArena");
        wager.setArena(newArena);
        assertEq(wager.arena(), newArena);
    }

    function test_upgradeByOwner() public {
        Wager newImpl = new Wager();
        wager.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgradeRevertsForNonOwner() public {
        Wager newImpl = new Wager();
        vm.prank(agent1);
        vm.expectRevert();
        wager.upgradeToAndCall(address(newImpl), "");
    }
}
