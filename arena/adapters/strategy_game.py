"""
StrategyGameAdapter — implements GameAdapter for "Clash of Wits" (RPSLS).

A multi-round Rock-Paper-Scissors-Lizard-Spock game, best-of-5 rounds.
Fallback game when no N64 emulator is available — AI agents can play this
with pure LLM reasoning (no emulator required).

Rules (RPSLS):
  scissors cuts paper, paper covers rock, rock crushes lizard,
  lizard poisons spock, spock smashes scissors, scissors decapitates lizard,
  lizard eats paper, paper disproves spock, spock vaporizes rock,
  rock crushes scissors.
"""
from __future__ import annotations
import asyncio
import logging
import os
import time
from typing import Optional

from arena.adapters.base import GameAdapter, GameAdapterError

logger = logging.getLogger(__name__)

VALID_MOVES = {"rock", "paper", "scissors", "lizard", "spock"}

# Which moves each move beats: key beats all values in its set
BEATS: dict[str, set[str]] = {
    "rock":     {"scissors", "lizard"},
    "paper":    {"rock", "spock"},
    "scissors": {"paper", "lizard"},
    "lizard":   {"spock", "paper"},
    "spock":    {"scissors", "rock"},
}

BEST_OF = int(os.environ.get("STRATEGY_BEST_OF", 5))
# How long to wait for both agents to submit moves before auto-resolving (seconds)
MOVE_TIMEOUT_S = float(os.environ.get("STRATEGY_MOVE_TIMEOUT_S", 30.0))


def _resolve_round(move_a: str, move_b: str) -> int:
    """
    Resolve a single RPSLS round.
    Returns: 0 if agent A wins, 1 if agent B wins, -1 if draw.
    """
    if move_a == move_b:
        return -1
    if move_b in BEATS[move_a]:
        return 0
    return 1


class StrategyGameAdapter(GameAdapter):
    """
    Adapter for "Clash of Wits" — RPSLS best-of-N.
    Designed for 2 agents. Each round both agents submit moves via submit_action().
    get_race_state() returns the current game state compatible with the WS schema.
    """

    def __init__(self, best_of: int = BEST_OF):
        self.best_of = best_of
        self.wins_needed = (best_of // 2) + 1
        self._match_id: Optional[str] = None
        self._agents: list[str] = []
        self._tick = 0
        self._start_time: Optional[float] = None
        self._status = "waiting"

        # Round state
        self._current_round = 0
        self._scores: list[int] = [0, 0]  # wins per agent
        self._round_history: list[dict] = []  # [{round, moves, winner_index, winner_move}]
        self._pending_moves: dict[str, str] = {}  # agent_addr -> move (for current round)
        self._move_events: dict[str, asyncio.Event] = {}  # agent_addr -> event
        self._round_lock = asyncio.Lock()

    async def start_match(self, match_id: str, agents: list[str]) -> None:
        if len(agents) != 2:
            raise GameAdapterError(f"Clash of Wits requires exactly 2 agents, got {len(agents)}")
        self._match_id = match_id
        self._agents = agents
        self._tick = 0
        self._start_time = time.time()
        self._status = "in_progress"
        self._current_round = 1
        self._scores = [0, 0]
        self._round_history = []
        self._pending_moves = {}
        self._move_events = {addr: asyncio.Event() for addr in agents}
        logger.info(f"StrategyGameAdapter.start_match: match={match_id}, agents={agents}, best_of={self.best_of}")

    async def submit_action(self, match_id: str, agent_id: str, action: str) -> dict:
        """
        Agent submits a move for the current round.
        Returns the round result if both agents have moved, otherwise acknowledgment.
        """
        if self._status != "in_progress":
            raise GameAdapterError(f"Match not in progress (status={self._status})")
        if match_id != self._match_id:
            raise GameAdapterError(f"Wrong match_id: expected {self._match_id}, got {match_id}")
        if agent_id not in self._agents:
            raise GameAdapterError(f"Unknown agent: {agent_id}")

        move = action.lower().strip()
        if move not in VALID_MOVES:
            raise GameAdapterError(f"Invalid move '{action}'. Valid: {sorted(VALID_MOVES)}")

        async with self._round_lock:
            if agent_id in self._pending_moves:
                return {
                    "status": "already_submitted",
                    "round": self._current_round,
                    "message": "Move already submitted for this round. Waiting for opponent.",
                }

            self._pending_moves[agent_id] = move
            logger.info(
                f"Agent {agent_id} submitted move for round {self._current_round}: {move}"
            )

            # Signal that this agent has moved
            if agent_id in self._move_events:
                self._move_events[agent_id].set()

            # If both agents have submitted, resolve the round
            if len(self._pending_moves) == 2:
                result = self._resolve_current_round()
                return result

        return {
            "status": "move_accepted",
            "round": self._current_round,
            "message": "Move accepted. Waiting for opponent.",
        }

    def _resolve_current_round(self) -> dict:
        """Resolve the current round given both moves are in."""
        move_a = self._pending_moves[self._agents[0]]
        move_b = self._pending_moves[self._agents[1]]
        winner_index = _resolve_round(move_a, move_b)

        round_record = {
            "round": self._current_round,
            "moves": {self._agents[0]: move_a, self._agents[1]: move_b},
            "winner_index": winner_index,
            "winner_agent": self._agents[winner_index] if winner_index >= 0 else None,
            "result": "draw" if winner_index < 0 else f"{self._agents[winner_index]} wins",
        }
        self._round_history.append(round_record)

        if winner_index >= 0:
            self._scores[winner_index] += 1
            logger.info(
                f"Round {self._current_round}: {self._agents[winner_index]} wins "
                f"({move_a} vs {move_b}). Score: {self._scores}"
            )
        else:
            logger.info(f"Round {self._current_round}: Draw ({move_a} vs {move_b}). Score: {self._scores}")

        # Check for match winner
        if self._scores[0] >= self.wins_needed or self._scores[1] >= self.wins_needed:
            self._status = "finished"
            winner_idx = 0 if self._scores[0] >= self.wins_needed else 1
            logger.info(
                f"Match finished: {self._agents[winner_idx]} wins "
                f"{self._scores[winner_idx]}-{self._scores[1 - winner_idx]}"
            )
        else:
            # Advance to next round
            self._current_round += 1
            self._pending_moves = {}
            for evt in self._move_events.values():
                evt.clear()

        return {
            "status": "round_resolved",
            **round_record,
            "scores": {self._agents[i]: self._scores[i] for i in range(2)},
            "match_status": self._status,
        }

    async def get_race_state(self) -> dict:
        """
        Return current game state in the format expected by race_runner._state_to_player_states().
        Maps RPSLS concepts onto the racing schema:
          - position: 1 for leader (higher score), 2 for trailing
          - lap: current round number
          - total_laps: best_of
          - speed: score (wins so far)
          - x/y: encode round progress visually
          - item: last move played
          - gap_to_leader_ms: score difference * 1000 (for visual effect)
          - finished: whether this agent has clinched the match
        """
        self._tick += 1

        # Determine positions based on scores
        if self._scores[0] > self._scores[1]:
            positions = [1, 2]
        elif self._scores[1] > self._scores[0]:
            positions = [2, 1]
        else:
            positions = [1, 1]

        players = []
        for i, agent_addr in enumerate(self._agents):
            last_move = None
            if self._round_history:
                last_round = self._round_history[-1]
                last_move = last_round["moves"].get(agent_addr)

            score_diff = abs(self._scores[0] - self._scores[1])
            is_leader = self._scores[i] >= self._scores[1 - i]

            players.append({
                "agent_id": agent_addr,
                "position": positions[i],
                "lap": self._current_round,
                "total_laps": self.best_of,
                "item": last_move,
                "speed": float(self._scores[i]),
                "x": float(self._current_round * 100),
                "y": float(self._scores[i] * 50),
                "gap_to_leader_ms": 0 if is_leader else score_diff * 1000,
                "finished": self._status == "finished",
            })

        # Auto-timeout: if we've been waiting too long for moves, force random
        if self._status == "in_progress" and self._start_time:
            round_start = self._start_time
            if self._round_history:
                # Approximate round start from tick rate
                round_start = self._start_time + len(self._round_history) * MOVE_TIMEOUT_S
            elapsed_in_round = time.time() - round_start
            if elapsed_in_round > MOVE_TIMEOUT_S and len(self._pending_moves) < 2:
                await self._force_timeout_moves()

        return {
            "players": players,
            "race_status": self._status,
            "tick": self._tick,
            "game_type": "clash_of_wits",
            "round": self._current_round,
            "scores": {self._agents[i]: self._scores[i] for i in range(2)},
            "round_history": self._round_history,
            "pending_count": len(self._pending_moves),
        }

    async def _force_timeout_moves(self) -> None:
        """Force-submit a random move for agents who haven't submitted."""
        import random
        async with self._round_lock:
            for agent_addr in self._agents:
                if agent_addr not in self._pending_moves:
                    forced_move = random.choice(list(VALID_MOVES))
                    self._pending_moves[agent_addr] = forced_move
                    logger.warning(
                        f"Timeout: forced move '{forced_move}' for agent {agent_addr} "
                        f"in round {self._current_round}"
                    )
            if len(self._pending_moves) == 2:
                self._resolve_current_round()

    async def get_race_result(self) -> dict:
        if self._status != "finished":
            raise GameAdapterError("Match not finished")

        # Determine winner (agent with more wins)
        if self._scores[0] > self._scores[1]:
            winner_idx = 0
        else:
            winner_idx = 1

        # Pad to 4 slots for compatibility with MatchProof contract
        agents_padded = (self._agents + ["0x" + "0" * 40] * 4)[:4]
        positions = [2, 2, 0, 0]  # default all to 2nd / DNF
        positions[winner_idx] = 1
        positions[1 - winner_idx] = 2

        # Encode scores as "finish times" — lower is better, winner has lower time
        elapsed_ms = int((time.time() - (self._start_time or time.time())) * 1000)
        times = [0, 0, 0, 0]
        times[winner_idx] = elapsed_ms
        times[1 - winner_idx] = elapsed_ms + (self._scores[winner_idx] - self._scores[1 - winner_idx]) * 5000

        return {
            "agents": agents_padded,
            "finalPositions": positions,
            "finishTimes": times,
            "trackId": 99,  # 99 = Clash of Wits game type
            "matchId": self._derive_match_id(),
            "timestamp": int(time.time()),
            "game_type": "clash_of_wits",
            "scores": {self._agents[i]: self._scores[i] for i in range(2)},
            "round_history": self._round_history,
        }

    def _derive_match_id(self) -> int:
        """Convert match_id string to int, falling back to hash for non-hex strings."""
        if not self._match_id:
            return 0
        clean = self._match_id.replace("-", "")
        try:
            return int(clean[:15], 16)
        except ValueError:
            return abs(hash(self._match_id)) % (10 ** 15)

    async def stop_match(self) -> None:
        self._status = "finished"
        logger.info(f"StrategyGameAdapter.stop_match: match={self._match_id}")

    def get_round_history(self) -> list[dict]:
        """Return full round history for LLM agent reasoning."""
        return list(self._round_history)

    def get_game_context_for_agent(self, agent_id: str) -> dict:
        """
        Return game context formatted for LLM agent prompts.
        Includes opponent's past moves so the agent can reason about patterns.
        """
        if agent_id not in self._agents:
            return {}

        agent_idx = self._agents.index(agent_id)
        opponent_idx = 1 - agent_idx
        opponent_id = self._agents[opponent_idx]

        opponent_moves = []
        my_moves = []
        for rnd in self._round_history:
            opponent_moves.append(rnd["moves"].get(opponent_id, "unknown"))
            my_moves.append(rnd["moves"].get(agent_id, "unknown"))

        return {
            "game": "Clash of Wits (RPSLS)",
            "valid_moves": sorted(VALID_MOVES),
            "current_round": self._current_round,
            "best_of": self.best_of,
            "my_score": self._scores[agent_idx],
            "opponent_score": self._scores[opponent_idx],
            "my_past_moves": my_moves,
            "opponent_past_moves": opponent_moves,
            "round_history": [
                {
                    "round": r["round"],
                    "my_move": r["moves"].get(agent_id),
                    "opponent_move": r["moves"].get(opponent_id),
                    "i_won": r["winner_index"] == agent_idx,
                    "draw": r["winner_index"] == -1,
                }
                for r in self._round_history
            ],
            "rules": (
                "scissors cuts paper, paper covers rock, rock crushes lizard, "
                "lizard poisons spock, spock smashes scissors, scissors decapitates lizard, "
                "lizard eats paper, paper disproves spock, spock vaporizes rock, rock crushes scissors"
            ),
        }
