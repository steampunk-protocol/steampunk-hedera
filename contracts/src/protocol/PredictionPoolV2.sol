// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PredictionPoolV2
 * @notice Non-upgradeable parimutuel prediction pool. Hedera-compatible.
 */
contract PredictionPoolV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public arena;
    uint256 public feeBps;

    enum PoolStatus { Open, Locked, Settled }

    struct Pool {
        uint256 matchId;
        address[] agents;
        PoolStatus status;
        address winner;
        uint256 totalPool;
    }

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => uint256)) public agentTotals;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public bets;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event PoolCreated(uint256 indexed matchId, address[] agents);
    event BetPlaced(uint256 indexed matchId, address indexed bettor, address indexed agent, uint256 amount);
    event PoolLocked(uint256 indexed matchId);
    event PoolSettled(uint256 indexed matchId, address indexed winner);
    event WinningsClaimed(uint256 indexed matchId, address indexed bettor, uint256 amount);
    event ArenaUpdated(address indexed newArena);
    event FeeBpsUpdated(uint256 newFeeBps);

    modifier onlyArena() {
        require(msg.sender == arena, "only arena");
        _;
    }

    constructor(address _token, address _arena, address initialOwner) Ownable(initialOwner) {
        token = IERC20(_token);
        arena = _arena;
        feeBps = 250; // 2.5%
    }

    function setArena(address _arena) external onlyOwner {
        arena = _arena;
        emit ArenaUpdated(_arena);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "fee too high");
        feeBps = _feeBps;
        emit FeeBpsUpdated(_feeBps);
    }

    function createPool(uint256 matchId, address[] calldata agents) external onlyArena {
        require(pools[matchId].matchId == 0, "pool exists");
        pools[matchId] = Pool({
            matchId: matchId,
            agents: agents,
            status: PoolStatus.Open,
            winner: address(0),
            totalPool: 0
        });
        emit PoolCreated(matchId, agents);
    }

    function placeBet(uint256 matchId, address agent, uint256 amount) external nonReentrant {
        Pool storage pool = pools[matchId];
        require(pool.matchId > 0, "pool not found");
        require(pool.status == PoolStatus.Open, "not open");
        require(amount > 0, "amount must be > 0");

        bool isAgent = false;
        for (uint256 i = 0; i < pool.agents.length; i++) {
            if (pool.agents[i] == agent) { isAgent = true; break; }
        }
        require(isAgent, "invalid agent");

        token.safeTransferFrom(msg.sender, address(this), amount);
        bets[matchId][msg.sender][agent] += amount;
        agentTotals[matchId][agent] += amount;
        pool.totalPool += amount;

        emit BetPlaced(matchId, msg.sender, agent, amount);
    }

    function lockPool(uint256 matchId) external onlyArena {
        Pool storage pool = pools[matchId];
        require(pool.status == PoolStatus.Open, "not open");
        pool.status = PoolStatus.Locked;
        emit PoolLocked(matchId);
    }

    function settlePool(uint256 matchId, address winner) external onlyArena {
        Pool storage pool = pools[matchId];
        require(pool.status == PoolStatus.Locked, "not locked");
        pool.status = PoolStatus.Settled;
        pool.winner = winner;
        emit PoolSettled(matchId, winner);
    }

    function claimWinnings(uint256 matchId) external nonReentrant {
        Pool storage pool = pools[matchId];
        require(pool.status == PoolStatus.Settled, "not settled");
        require(!claimed[matchId][msg.sender], "already claimed");

        uint256 betOnWinner = bets[matchId][msg.sender][pool.winner];
        require(betOnWinner > 0, "no winning bet");

        claimed[matchId][msg.sender] = true;

        uint256 winnerPool = agentTotals[matchId][pool.winner];
        uint256 fee = (pool.totalPool * feeBps) / 10000;
        uint256 payoutPool = pool.totalPool - fee;
        uint256 payout = (betOnWinner * payoutPool) / winnerPool;

        token.safeTransfer(msg.sender, payout);
        emit WinningsClaimed(matchId, msg.sender, payout);
    }

    function getPoolTotals(uint256 matchId) external view returns (address[] memory agents, uint256[] memory totals) {
        Pool storage pool = pools[matchId];
        agents = pool.agents;
        totals = new uint256[](agents.length);
        for (uint256 i = 0; i < agents.length; i++) {
            totals[i] = agentTotals[matchId][agents[i]];
        }
    }
}
