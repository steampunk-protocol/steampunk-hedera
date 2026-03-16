"""
RuleBasedAgent — deterministic baseline agent for Mario Kart 64.
Extends GameAgent ABC. No ML, no LLM — pure heuristics.

Behavior:
- Always accelerate (hold A)
- Steer toward track center using X position
- Use items based on item_policy
- Anti-stuck brake when speed is too low

Strategy parameters are configurable at runtime via update_strategy().
External agents set strategy via the arena's POST /matches/{id}/strategy endpoint,
which forwards to the emulator, which calls update_strategy() on the running agent.
"""
from __future__ import annotations
import logging
import time

from emulator.agents.base import GameAgent, Observation, Action, AgentMetadata

logger = logging.getLogger(__name__)

# Defaults (balanced strategy)
TRACK_CENTER_X = 0.0
STUCK_SPEED_THRESHOLD = 5.0

# Strategy presets: maps strategy name → (steer_gain, speed_bias, item_use_threshold)
# steer_gain: how aggressively to correct toward center (higher = more aggressive cornering)
# speed_bias: multiplier on acceleration commitment (1.0 = always, 0.7 = cautious)
# item_use_threshold: frames to hold item before using (0 = immediate)
STRATEGY_PRESETS = {
    "aggressive": {
        "steer_gain": 0.08,       # cut corners hard
        "speed_bias": 1.0,        # max speed always
        "item_hold_frames": 0,    # use items immediately
        "hop_on_corners": True,   # mini-turbo attempts
        "stuck_threshold": 20,    # less patience before anti-stuck
    },
    "defensive": {
        "steer_gain": 0.03,       # gentle, safe lines
        "speed_bias": 0.85,       # occasionally ease off
        "item_hold_frames": 120,  # hold items for defense (~2s at 60fps)
        "hop_on_corners": False,
        "stuck_threshold": 45,    # more patience
    },
    "balanced": {
        "steer_gain": 0.05,
        "speed_bias": 1.0,
        "item_hold_frames": 0,
        "hop_on_corners": False,
        "stuck_threshold": 30,
    },
    "item_focus": {
        "steer_gain": 0.05,
        "speed_bias": 0.9,
        "item_hold_frames": 180,  # hoard items (~3s), target leader
        "hop_on_corners": False,
        "stuck_threshold": 30,
    },
}


class RuleBasedAgent(GameAgent):
    """
    Deterministic rule-based Mario Kart 64 agent with configurable strategy.

    Strategy params can be updated mid-race via update_strategy().
    """

    def __init__(
        self,
        name: str = "rule-based-v1",
        owner_wallet: str = "",
        agent_wallet: str = "",
        track_center_x: float = TRACK_CENTER_X,
        strategy: str = "balanced",
    ):
        self.name = name
        self.owner_wallet = owner_wallet
        self.agent_wallet = agent_wallet
        self.track_center_x = track_center_x
        self._step_count = 0
        self._stuck_counter = 0
        self._item_hold_counter = 0

        # Strategy params — set from preset
        self.steer_gain: float = 0.05
        self.speed_bias: float = 1.0
        self.item_hold_frames: int = 0
        self.hop_on_corners: bool = False
        self.stuck_threshold: int = 30

        # Current strategy metadata
        self.current_strategy: str = "balanced"
        self.current_target: str = "none"
        self.current_item_policy: str = "immediate"
        self.last_strategy_update: float = 0.0

        self.update_strategy(strategy)

    def update_strategy(
        self,
        strategy: str = "balanced",
        target: str = "none",
        item_policy: str = "immediate",
    ):
        """
        Update agent strategy at runtime. Called by EmulatorService when
        arena forwards an external agent's strategy command.
        """
        preset = STRATEGY_PRESETS.get(strategy, STRATEGY_PRESETS["balanced"])
        self.steer_gain = preset["steer_gain"]
        self.speed_bias = preset["speed_bias"]
        self.item_hold_frames = preset["item_hold_frames"]
        self.hop_on_corners = preset["hop_on_corners"]
        self.stuck_threshold = preset["stuck_threshold"]

        # Override item hold based on explicit item_policy
        if item_policy == "immediate":
            self.item_hold_frames = 0
        elif item_policy == "save_for_straight":
            self.item_hold_frames = 90  # ~1.5s
        elif item_policy == "save_for_opponent":
            self.item_hold_frames = 180  # ~3s

        self.current_strategy = strategy
        self.current_target = target
        self.current_item_policy = item_policy
        self.last_strategy_update = time.time()

        logger.info(
            f"Agent {self.name} strategy updated: {strategy} "
            f"(steer={self.steer_gain}, speed={self.speed_bias}, "
            f"item_hold={self.item_hold_frames}f)"
        )

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
        """Decide action based on current observation and strategy params."""
        self._step_count += 1

        if observation.finished:
            return Action(accelerate=False), "race finished"

        # Detect stuck
        if observation.speed < STUCK_SPEED_THRESHOLD:
            self._stuck_counter += 1
        else:
            self._stuck_counter = 0

        # Anti-stuck brake
        if self._stuck_counter > self.stuck_threshold:
            self._stuck_counter = 0
            return Action(accelerate=False, brake=True, steer=0.0), "anti-stuck brake"

        # Steering: proportional to deviation from track center
        x_error = observation.x - self.track_center_x
        steer = max(-1.0, min(1.0, -x_error * self.steer_gain))

        # Item logic: hold item for configured frames before using
        use_item = False
        if observation.item is not None:
            self._item_hold_counter += 1
            if self._item_hold_counter >= self.item_hold_frames:
                use_item = True
                self._item_hold_counter = 0
        else:
            self._item_hold_counter = 0

        # Hop on sharp corners (aggressive strategy)
        hop = False
        if self.hop_on_corners and abs(steer) > 0.6:
            hop = True

        # Speed bias: occasionally release accelerate for defensive play
        accelerate = True
        if self.speed_bias < 1.0 and self._step_count % 10 == 0:
            # Release accelerate proportional to speed_bias
            import random
            if random.random() > self.speed_bias:
                accelerate = False

        action = Action(
            accelerate=accelerate,
            brake=False,
            steer=steer,
            use_item=use_item,
            hop=hop,
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
        self._item_hold_counter = 0
