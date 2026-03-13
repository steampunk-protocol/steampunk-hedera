"""
MK64GameAdapter — implements GameAdapter for Mario Kart 64.

Wraps MarioKart64MultiAgentEnv (emulator/envs/mariokart64_multi.py).
This is the ONLY place MK64-specific logic lives in the arena.
oracle/reader.py and race_runner.py never import this directly — they use GameAdapter.
"""
from __future__ import annotations
import asyncio
import logging
import os
import time
from typing import Optional

from arena.adapters.base import GameAdapter, GameAdapterError

logger = logging.getLogger(__name__)

# Configurable race timeout for local adapter stub (seconds).
# After this duration the race is marked finished.
LOCAL_RACE_TIMEOUT_S = float(os.environ.get("LOCAL_RACE_TIMEOUT_S", 90.0))
# Total laps for the race; race finishes when all agents complete this many laps.
LOCAL_RACE_LAPS = int(os.environ.get("LOCAL_RACE_LAPS", 3))


class MK64GameAdapter(GameAdapter):
    """
    Adapter between arena and MarioKart64MultiAgentEnv.
    Full implementation deferred to W5-A wire-up.
    Stub returns plausible data so arena can proceed.
    """

    def __init__(self, n_agents: int = 2, track_id: int = 0):
        self.n_agents = n_agents
        self.track_id = track_id
        self._match_id: Optional[str] = None
        self._agents: list[str] = []
        self._tick = 0
        self._start_time: Optional[float] = None
        self._status = "waiting"
        self._env = None  # MarioKart64MultiAgentEnv — set in start_match (W5-A)

    async def start_match(self, match_id: str, agents: list[str]) -> None:
        if len(agents) < 2 or len(agents) > 4:
            raise GameAdapterError(f"MK64 requires 2-4 agents, got {len(agents)}")
        self._match_id = match_id
        self._agents = agents
        self._tick = 0
        self._start_time = time.time()
        self._status = "in_progress"
        logger.info(f"MK64GameAdapter.start_match: match={match_id}, agents={agents}")
        # W5-A: instantiate MarioKart64MultiAgentEnv and call reset() here

    async def get_race_state(self) -> dict:
        self._tick += 1
        elapsed_s = time.time() - (self._start_time or time.time())
        elapsed_ms = int(elapsed_s * 1000)

        # Determine if the race should finish:
        # - All agents completed LOCAL_RACE_LAPS (simulated at 1 lap per 30s)
        # - OR elapsed time exceeds LOCAL_RACE_TIMEOUT_S
        all_finished = True
        players = []
        for i, agent_addr in enumerate(self._agents):
            # Stagger finish: agent i finishes (i * 5)s after leader
            agent_elapsed_s = elapsed_s - (i * 5)
            lap = min(LOCAL_RACE_LAPS, max(1, 1 + int(agent_elapsed_s * 1000) // 30000))
            agent_finished = lap >= LOCAL_RACE_LAPS and agent_elapsed_s >= LOCAL_RACE_LAPS * 30
            if not agent_finished:
                all_finished = False
            players.append({
                "agent_id": agent_addr,
                "position": i + 1,
                "lap": lap,
                "total_laps": LOCAL_RACE_LAPS,
                "item": None,
                "speed": 80.0 - i * 5,
                "x": float(i * 100),
                "y": 0.0,
                "gap_to_leader_ms": i * 1200,
                "finished": agent_finished,
            })

        # Finish the race when all laps completed or timeout exceeded
        if self._status == "in_progress" and (all_finished or elapsed_s >= LOCAL_RACE_TIMEOUT_S):
            self._status = "finished"
            # Mark all players as finished
            for p in players:
                p["finished"] = True
            logger.info(
                f"MK64GameAdapter race finished: match={self._match_id}, "
                f"elapsed={elapsed_s:.1f}s, reason={'timeout' if elapsed_s >= LOCAL_RACE_TIMEOUT_S else 'laps_complete'}"
            )

        return {
            "players": players,
            "race_status": self._status,
            "tick": self._tick,
        }

    async def get_race_result(self) -> dict:
        if self._status != "finished":
            raise GameAdapterError("Race not finished")

        # Pad to 4 slots
        agents_padded = (self._agents + ["0x" + "0" * 40] * 4)[:4]
        positions = list(range(1, len(self._agents) + 1)) + [0] * (4 - len(self._agents))
        times = [120000 + i * 5000 for i in range(len(self._agents))] + [0] * (4 - len(self._agents))

        return {
            "agents": agents_padded,
            "finalPositions": positions,
            "finishTimes": times,
            "trackId": self.track_id,
            "matchId": self._derive_match_id(),
            "timestamp": int(time.time()),
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
        if self._env is not None:
            try:
                self._env.close()
            except Exception as e:
                logger.warning(f"Error closing env: {e}")
        logger.info(f"MK64GameAdapter.stop_match: match={self._match_id}")
