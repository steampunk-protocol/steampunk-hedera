"""
RuleBasedAgent — deterministic baseline agent for Mario Kart 64.
Extends GameAgent ABC. No ML, no LLM — pure heuristics.

Behavior:
- Always accelerate (hold A)
- Steer toward track center using X position
- Use items immediately when held
- Never brakes unless going backwards
"""
from __future__ import annotations
import logging

from emulator.agents.base import GameAgent, Observation, Action, AgentMetadata

logger = logging.getLogger(__name__)

# Target X coordinate for track center (placeholder — calibrate per track)
TRACK_CENTER_X = 0.0
# Steering gain: how aggressively to correct toward center
STEER_GAIN = 0.05
# Speed threshold below which we assume we're stuck/reversed
STUCK_SPEED_THRESHOLD = 5.0


class RuleBasedAgent(GameAgent):
    """
    Deterministic rule-based Mario Kart 64 agent.

    Strategy:
    1. Always hold accelerate (A button)
    2. Steer proportionally toward track center X
    3. Use any item immediately
    4. If speed very low, briefly brake to reset (anti-stuck)
    """

    def __init__(
        self,
        name: str = "rule-based-v1",
        owner_wallet: str = "",
        agent_wallet: str = "",
        track_center_x: float = TRACK_CENTER_X,
    ):
        self.name = name
        self.owner_wallet = owner_wallet
        self.agent_wallet = agent_wallet
        self.track_center_x = track_center_x
        self._step_count = 0
        self._stuck_counter = 0

    def observe(self, raw_state: dict) -> Observation:
        """Convert raw env state dict to typed Observation."""
        return Observation(
            agent_id=raw_state.get("agent_id", "unknown"),
            x=float(raw_state.get("x", 0.0)),
            y=float(raw_state.get("y", 0.0)),
            position=int(raw_state.get("position", 1)),
            lap=int(raw_state.get("lap", 1)),
            total_laps=int(raw_state.get("total_laps", 3)),
            speed=float(raw_state.get("speed", 0.0)),
            item=raw_state.get("item"),
            lap_time_ms=int(raw_state.get("lap_time_ms", 0)),
            race_time_ms=int(raw_state.get("race_time_ms", 0)),
            finished=bool(raw_state.get("finished", False)),
            finish_time_ms=int(raw_state.get("finish_time_ms", 0)),
        )

    def act(self, observation: Observation) -> tuple[Action, str]:
        """
        Decide action based on current observation.

        Returns:
            (Action, reasoning_text) — reasoning is empty for rule-based agent.
        """
        self._step_count += 1

        if observation.finished:
            return Action(accelerate=False), "race finished"

        # Detect stuck: very low speed for multiple steps
        if observation.speed < STUCK_SPEED_THRESHOLD:
            self._stuck_counter += 1
        else:
            self._stuck_counter = 0

        # Anti-stuck: brief brake if stuck for 30+ frames
        if self._stuck_counter > 30:
            self._stuck_counter = 0
            return Action(accelerate=False, brake=True, steer=0.0), "anti-stuck brake"

        # Steering: proportional to deviation from track center
        x_error = observation.x - self.track_center_x
        steer = max(-1.0, min(1.0, -x_error * STEER_GAIN))

        # Use item immediately if held
        use_item = observation.item is not None

        action = Action(
            accelerate=True,
            brake=False,
            steer=steer,
            use_item=use_item,
            hop=False,
        )

        return action, ""

    def get_metadata(self) -> AgentMetadata:
        return AgentMetadata(
            name=self.name,
            model="rule-based",
            owner_wallet=self.owner_wallet or "0x" + "0" * 40,
            agent_wallet=self.agent_wallet or "0x" + "0" * 40,
        )

    def reset(self) -> None:
        self._step_count = 0
        self._stuck_counter = 0
