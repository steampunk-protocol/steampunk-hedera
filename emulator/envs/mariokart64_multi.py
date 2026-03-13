"""
MarioKart64MultiAgentEnv — multi-agent Mario Kart 64 environment (stable-retro backend).

Strategy: N parallel retro.make() instances, one per agent, stepped in parallel threads
and synchronized per frame. Each agent has its own emulator process.

Anti-duplication:
- Single-agent env logic lives in mariokart64_retro.py — this class extends it
- RAM addresses come from data/MarioKart64-N64/data.json — never hardcoded here
- WS broadcasting lives in arena/ws/broadcaster.py — not here
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from emulator.agents.base import GameAgent, Observation, Action, AgentMetadata
from emulator.envs.mariokart64_retro import MarioKart64RetroEnv

logger = logging.getLogger(__name__)


@dataclass
class AgentSlot:
    """One agent's emulator instance and state."""
    agent_id: str
    agent: GameAgent
    player_index: int
    env: MarioKart64RetroEnv = field(default_factory=lambda: MarioKart64RetroEnv())
    last_observation: Optional[Observation] = None
    finished: bool = False
    finish_time_ms: int = 0
    finish_position: int = 0
    error: Optional[Exception] = None


class MarioKart64MultiAgentEnv:
    """
    Multi-agent Mario Kart 64 environment using stable-retro.

    Runs N retro.make() instances in parallel (one per agent).
    Synchronized per-frame via thread coordination.

    Args:
        n_agents: Number of agents (2-4).
        track_id: Track to race on (0-based index; reserved for future state selection).
        total_laps: Number of laps (default 3).
    """

    def __init__(
        self,
        n_agents: int = 2,
        track_id: int = 0,
        total_laps: int = 3,
    ):
        assert 2 <= n_agents <= 4, "MarioKart64MultiAgentEnv requires 2-4 agents"
        self.n_agents = n_agents
        self.track_id = track_id
        self.total_laps = total_laps

        self._slots: list[AgentSlot] = []
        self._running = False
        self._start_time_ms: int = 0
        self._lock = threading.Lock()

    def register_agents(self, agents: list[tuple[str, GameAgent]]) -> None:
        """
        Register agents before reset().

        Args:
            agents: List of (agent_id, GameAgent) tuples.
        """
        assert len(agents) == self.n_agents, (
            f"Expected {self.n_agents} agents, got {len(agents)}"
        )
        self._slots = [
            AgentSlot(
                agent_id=agent_id,
                agent=agent,
                player_index=i,
                env=MarioKart64RetroEnv(
                    player_index=i,
                    total_laps=self.total_laps,
                ),
            )
            for i, (agent_id, agent) in enumerate(agents)
        ]

    def reset(self) -> dict[str, Observation]:
        """
        Reset all emulator instances and return initial observations.
        Returns dict of agent_id -> Observation.
        """
        if not self._slots:
            raise RuntimeError("Call register_agents() before reset()")

        for slot in self._slots:
            slot.finished = False
            slot.finish_time_ms = 0
            slot.finish_position = 0
            slot.error = None
            slot.agent.reset()

        self._running = True
        self._start_time_ms = int(time.time() * 1000)

        # Reset all envs in parallel
        errors: list[tuple[int, Exception]] = []
        lock = threading.Lock()

        def _reset_slot(slot: AgentSlot) -> None:
            try:
                obs = slot.env.reset()
                slot.last_observation = obs
            except Exception as e:
                with lock:
                    errors.append((slot.player_index, e))
                logger.error(f"[slot {slot.player_index}] reset failed: {e}", exc_info=True)

        threads = [threading.Thread(target=_reset_slot, args=(s,), daemon=True) for s in self._slots]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        if errors:
            self._running = False
            msg = "; ".join(f"slot {i}: {e}" for i, e in errors)
            raise RuntimeError(f"Failed to reset emulators: {msg}")

        return {slot.agent_id: slot.last_observation for slot in self._slots}

    def step(
        self,
        actions: dict[str, Action],
    ) -> tuple[dict[str, Observation], dict[str, float], bool, dict]:
        """
        Step all agents one frame.

        Args:
            actions: Dict of agent_id -> Action.

        Returns:
            (observations, rewards, done, info)
        """
        if not self._running:
            raise RuntimeError("Call reset() before step()")

        observations: dict[str, Observation] = {}
        rewards: dict[str, float] = {}
        step_errors: list[tuple[int, Exception]] = []
        lock = threading.Lock()

        def _step_slot(slot: AgentSlot) -> None:
            if slot.agent_id not in actions:
                return
            action = actions[slot.agent_id]
            # Convert Action to stable-retro MultiBinary array
            retro_action = _action_to_retro(action, slot.env.action_space)
            try:
                obs, reward, done, info = slot.env.step(retro_action)
            except Exception as e:
                with lock:
                    step_errors.append((slot.player_index, e))
                logger.error(f"[slot {slot.player_index}] step failed: {e}", exc_info=True)
                return

            slot.last_observation = obs
            with lock:
                observations[slot.agent_id] = obs
                if obs.finished and not slot.finished:
                    slot.finished = True
                    slot.finish_time_ms = obs.finish_time_ms
                    _assign_finish_position(slot, self._slots, self._lock)
                    rewards[slot.agent_id] = 1.0 if slot.finish_position == 1 else -0.5
                else:
                    rewards[slot.agent_id] = float(reward)

        threads = [threading.Thread(target=_step_slot, args=(s,), daemon=True) for s in self._slots]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        done = all(slot.finished for slot in self._slots)
        if done:
            self._running = False

        info = {
            "finish_positions": {
                slot.agent_id: slot.finish_position
                for slot in self._slots
            }
        }

        return observations, rewards, done, info

    def get_race_result(self) -> dict:
        """
        Get final race result after done=True.
        Returns dict compatible with MarioKartResult struct for EIP-712 signing.
        """
        assert not self._running, "Race not finished yet"

        agents_padded = ["0x" + "0" * 40] * 4
        positions_padded = [0] * 4
        times_padded = [0] * 4

        for slot in self._slots:
            meta = slot.agent.get_metadata()
            agents_padded[slot.player_index] = meta.agent_wallet
            positions_padded[slot.player_index] = slot.finish_position
            times_padded[slot.player_index] = slot.finish_time_ms

        return {
            "agents": agents_padded,
            "finalPositions": positions_padded,
            "finishTimes": times_padded,
            "trackId": self.track_id,
            # matchId and timestamp set by arena oracle
        }

    def close(self) -> None:
        """Shut down all emulator instances."""
        self._running = False
        for slot in self._slots:
            try:
                slot.env.close()
            except Exception as e:
                logger.warning(f"[slot {slot.player_index}] close error: {e}")


# -- Helpers -------------------------------------------------------------------

def _action_to_retro(action: Action, action_space) -> np.ndarray:
    """
    Convert an Action dataclass to a stable-retro MultiBinary array.

    N64 button mapping (12 buttons in stable-retro):
    Index: 0=B, 1=Y, 2=SELECT, 3=START, 4=UP, 5=DOWN, 6=LEFT, 7=RIGHT,
           8=A, 9=X, 10=L, 11=R
    """
    arr = np.zeros(12, dtype=np.int8)

    arr[8] = int(action.accelerate)   # A = accelerate
    arr[0] = int(action.brake)        # B = brake
    arr[11] = int(action.hop)         # R = hop/drift
    arr[9] = int(action.use_item)     # X = item (Z on N64, mapped to X in retro)

    # Steer: map float [-1, 1] to LEFT/RIGHT buttons
    if action.steer < -0.1:
        arr[6] = 1   # LEFT
    elif action.steer > 0.1:
        arr[7] = 1   # RIGHT

    return arr


def _assign_finish_position(slot: AgentSlot, all_slots: list[AgentSlot], lock: threading.Lock) -> None:
    """Assign finish position based on order of completion (thread-safe)."""
    with lock:
        finished_count = sum(1 for s in all_slots if s.finish_position > 0)
        slot.finish_position = finished_count + 1
