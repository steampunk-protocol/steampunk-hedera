// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title WagerV2
 * @notice Non-upgradeable wager escrow. Hedera-compatible.
 */
contract WagerV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public arena;

    enum MatchStatus { Pending, Active, Settled, Cancelled }

    struct Match {
        uint256 matchId;
        address[] agents;
        uint256 wagerAmount;
        MatchStatus status;
        address winner;
    }

    mapping(uint256 => Match) public matches;
    mapping(uint256 => mapping(address => bool)) public deposited;

    event MatchCreated(uint256 indexed matchId, address[] agents, uint256 wagerAmount);
    event Deposited(uint256 indexed matchId, address indexed agent, uint256 amount);
    event MatchSettled(uint256 indexed matchId, address indexed winner, uint256 prize);
    event MatchCancelled(uint256 indexed matchId);
    event ArenaUpdated(address indexed newArena);

    modifier onlyArena() {
        require(msg.sender == arena, "only arena");
        _;
    }

    constructor(address _token, address _arena, address initialOwner) Ownable(initialOwner) {
        token = IERC20(_token);
        arena = _arena;
    }

    function setArena(address _arena) external onlyOwner {
        arena = _arena;
        emit ArenaUpdated(_arena);
    }

    function createMatch(uint256 matchId, address[] calldata agents, uint256 wagerAmount) external onlyArena {
        require(agents.length >= 2 && agents.length <= 4, "2-4 agents only");
        require(matches[matchId].matchId == 0, "match exists");
        require(wagerAmount > 0, "wager must be > 0");

        matches[matchId] = Match({
            matchId: matchId,
            agents: agents,
            wagerAmount: wagerAmount,
            status: MatchStatus.Pending,
            winner: address(0)
        });
        emit MatchCreated(matchId, agents, wagerAmount);
    }

    function deposit(uint256 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        require(m.matchId > 0, "match not found");
        require(m.status == MatchStatus.Pending, "not pending");
        require(!deposited[matchId][msg.sender], "already deposited");

        bool isAgent = false;
        for (uint256 i = 0; i < m.agents.length; i++) {
            if (m.agents[i] == msg.sender) { isAgent = true; break; }
        }
        require(isAgent, "not a match agent");

        token.safeTransferFrom(msg.sender, address(this), m.wagerAmount);
        deposited[matchId][msg.sender] = true;
        emit Deposited(matchId, msg.sender, m.wagerAmount);

        bool allDeposited = true;
        for (uint256 i = 0; i < m.agents.length; i++) {
            if (!deposited[matchId][m.agents[i]]) { allDeposited = false; break; }
        }
        if (allDeposited) m.status = MatchStatus.Active;
    }

    function settle(uint256 matchId, address winner) external onlyArena nonReentrant {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Active, "not active");

        bool isAgent = false;
        for (uint256 i = 0; i < m.agents.length; i++) {
            if (m.agents[i] == winner) { isAgent = true; break; }
        }
        require(isAgent, "winner not in match");

        m.status = MatchStatus.Settled;
        m.winner = winner;

        uint256 prize = m.wagerAmount * m.agents.length;
        token.safeTransfer(winner, prize);
        emit MatchSettled(matchId, winner, prize);
    }

    function cancel(uint256 matchId) external onlyArena nonReentrant {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Pending || m.status == MatchStatus.Active, "cannot cancel");
        m.status = MatchStatus.Cancelled;

        for (uint256 i = 0; i < m.agents.length; i++) {
            if (deposited[matchId][m.agents[i]]) {
                token.safeTransfer(m.agents[i], m.wagerAmount);
            }
        }
        emit MatchCancelled(matchId);
    }
}
