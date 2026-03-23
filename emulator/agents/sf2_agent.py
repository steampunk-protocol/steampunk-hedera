"""
SF2Agent — Rule-based Street Fighter II agent for Sega Genesis.

Extends the Agent Colosseum pattern with SF2-specific button mappings
and a frame-based move queue for executing multi-frame special moves.

Button layout (Genesis 6-button):
  B=0  A=1  MODE=2  START=3  UP=4  DOWN=5  LEFT=6  RIGHT=7  C=8  Y=9  X=10  Z=11

SF2 mapping:
  A=Light Punch  B=Medium Punch  C=Hard Punch
  X=Light Kick   Y=Medium Kick   Z=Hard Kick
  Directions: UP=4  DOWN=5  LEFT=6  RIGHT=7
"""

from __future__ import annotations

import logging
import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Button indices
BTN_B = 0       # Medium Punch
BTN_A = 1       # Light Punch
BTN_MODE = 2
BTN_START = 3
BTN_UP = 4
BTN_DOWN = 5
BTN_LEFT = 6
BTN_RIGHT = 7
BTN_C = 8       # Hard Punch
BTN_Y = 9       # Medium Kick
BTN_X = 10      # Light Kick
BTN_Z = 11      # Hard Kick

NUM_BUTTONS = 12


def _empty() -> np.ndarray:
    return np.zeros(NUM_BUTTONS, dtype=np.int8)


def _buttons(*indices: int) -> np.ndarray:
    a = _empty()
    for i in indices:
        a[i] = 1
    return a


# ---------------------------------------------------------------------------
# Pre-defined move frames (multi-frame sequences)
# ---------------------------------------------------------------------------

def _hadouken_frames(forward: int, punch: int = BTN_A) -> list[np.ndarray]:
    """Quarter-circle forward + punch: DOWN, DOWN+FWD, FWD+PUNCH."""
    return [
        _buttons(BTN_DOWN),
        _buttons(BTN_DOWN, forward),
        _buttons(forward, punch),
        _empty(),  # recovery frame
    ]


def _shoryuken_frames(forward: int, punch: int = BTN_A) -> list[np.ndarray]:
    """Forward, down, down-forward + punch."""
    return [
        _buttons(forward),
        _buttons(BTN_DOWN),
        _buttons(BTN_DOWN, forward),
        _buttons(forward, punch),
        _empty(),
    ]


def _hurricane_kick_frames(back: int, kick: int = BTN_Y) -> list[np.ndarray]:
    """Quarter-circle back + kick: DOWN, DOWN+BACK, BACK+KICK."""
    return [
        _buttons(BTN_DOWN),
        _buttons(BTN_DOWN, back),
        _buttons(back, kick),
        _empty(),
    ]


def _throw_frames(forward: int) -> list[np.ndarray]:
    """Walk forward + hard punch (throw range)."""
    return [
        _buttons(forward, BTN_C),
        _empty(),
    ]


# ---------------------------------------------------------------------------
# Observation wrapper for SF2
# ---------------------------------------------------------------------------

@dataclass
class SF2Observation:
    """Lightweight observation extracted from raw emulator state."""
    my_health: float = 1.0       # 0.0 - 1.0 normalized
    opp_health: float = 1.0
    distance: float = 0.5        # 0=touching, 1=full screen apart
    frame: int = 0
    round_over: bool = False
    raw: Optional[dict] = None


# ---------------------------------------------------------------------------
# SF2Agent
# ---------------------------------------------------------------------------

class SF2Agent:
    """
    Rule-based Street Fighter II agent with configurable strategy
    and a frame-based move queue for multi-frame specials.

    Compatible with the Agent Colosseum strategy API (update_strategy).
    """

    def __init__(
        self,
        name: str = "sf2-agent-v1",
        strategy: str = "balanced",
        player_index: int = 0,
    ):
        self.name = name
        self.player_index = player_index

        # Directional orientation: P1 faces right, P2 faces left
        self.forward = BTN_RIGHT if player_index == 0 else BTN_LEFT
        self.back = BTN_LEFT if player_index == 0 else BTN_RIGHT

        # Move queue: list of numpy arrays to emit one per frame
        self._move_queue: deque[np.ndarray] = deque()

        # Frame counter
        self._frame: int = 0

        # Cooldowns (prevent spamming the same special back-to-back)
        self._last_special_frame: int = -999
        self._special_cooldown: int = 30  # frames between specials

        # Strategy state
        self.current_strategy: str = "balanced"
        self.current_target: str = "none"
        self.current_item_policy: str = "immediate"
        self.last_strategy_update: float = 0.0

        # Strategy weights: (approach, attack_heavy, block, special, retreat)
        self._strategy_weights: dict[str, tuple[float, ...]] = {
            "aggressive":    (0.30, 0.35, 0.05, 0.25, 0.05),
            "defensive":     (0.05, 0.10, 0.45, 0.05, 0.35),
            "balanced":      (0.20, 0.25, 0.15, 0.25, 0.15),
            "special_focus": (0.10, 0.10, 0.10, 0.60, 0.10),
        }

        # Per-agent randomized thresholds for health-aware strategy shifts
        self._low_hp_threshold = 0.25 + random.random() * 0.15   # 0.25-0.40
        self._finish_threshold = 0.15 + random.random() * 0.15   # 0.15-0.30

        self.update_strategy(strategy)

    # ------------------------------------------------------------------
    # Strategy API (compatible with RuleBasedAgent)
    # ------------------------------------------------------------------

    def update_strategy(
        self,
        strategy: str = "balanced",
        target: str = "none",
        item_policy: str = "immediate",
    ):
        """Update agent strategy. item_policy='special' maps to special_focus."""
        if strategy == "item_focus":
            strategy = "special_focus"
        if strategy not in self._strategy_weights:
            strategy = "balanced"

        self.current_strategy = strategy
        self.current_target = target
        self.current_item_policy = item_policy
        self.last_strategy_update = time.time()

        logger.info(f"SF2Agent {self.name} strategy -> {strategy}")

    # ------------------------------------------------------------------
    # Core decision
    # ------------------------------------------------------------------

    def decide_action(self, observation: SF2Observation) -> np.ndarray:
        """
        Returns a numpy array of 12 button booleans for this frame.
        """
        self._frame += 1

        # If we're executing a queued multi-frame move, emit next frame
        if self._move_queue:
            return self._move_queue.popleft()

        # Round over — do nothing
        if observation.round_over:
            return _empty()

        # Health-aware strategy shift
        effective_strategy = self.current_strategy
        if effective_strategy == "balanced" and observation.my_health < self._low_hp_threshold:
            effective_strategy = "defensive"
        elif effective_strategy == "balanced" and observation.opp_health < self._finish_threshold:
            effective_strategy = "aggressive"

        weights = self._strategy_weights[effective_strategy]

        # Distance-aware adjustments
        close = observation.distance < 0.25
        mid = 0.25 <= observation.distance < 0.55
        far = observation.distance >= 0.55

        # Pick high-level action category via weighted random
        roll = random.random()
        cumulative = 0.0
        categories = ["approach", "attack_heavy", "block", "special", "retreat"]
        chosen = "approach"
        for cat, w in zip(categories, weights):
            cumulative += w
            if roll < cumulative:
                chosen = cat
                break

        # Override nonsensical picks based on distance
        if far and chosen == "attack_heavy":
            chosen = "approach"  # can't hit from far
        if far and chosen == "block":
            chosen = "approach"  # no need to block from far
        if close and chosen == "approach":
            chosen = "attack_heavy"  # already close, hit them

        self.last_action_category = chosen
        self.last_effective_strategy = effective_strategy
        return self._execute_category(chosen, observation, close, mid, far)

    def get_reasoning_text(self) -> str:
        """Human-readable reasoning for dashboard display."""
        cat = getattr(self, "last_action_category", "unknown")
        strat = getattr(self, "last_effective_strategy", self.current_strategy)
        labels = {
            "approach": "Moving in to close distance",
            "attack_heavy": "Throwing an attack",
            "block": "Blocking incoming attack",
            "special": "Executing special move",
            "retreat": "Creating space, backing off",
        }
        return f"[{strat.upper()}] {labels.get(cat, cat)}"

    def _execute_category(
        self,
        category: str,
        obs: SF2Observation,
        close: bool,
        mid: bool,
        far: bool,
    ) -> np.ndarray:
        """Map a high-level action category to button presses / move queue."""

        if category == "approach":
            return self._approach(obs)
        elif category == "attack_heavy":
            return self._attack(obs, close)
        elif category == "block":
            return self._block()
        elif category == "special":
            return self._special(obs)
        elif category == "retreat":
            return self._retreat()
        return _empty()

    # ------------------------------------------------------------------
    # Action implementations
    # ------------------------------------------------------------------

    def _approach(self, obs: SF2Observation) -> np.ndarray:
        """Walk or jump forward."""
        r = random.random()
        if r < 0.15:
            # Jump forward
            return _buttons(BTN_UP, self.forward)
        elif r < 0.30:
            # Dash forward (double-tap forward: queue two frames)
            self._move_queue.append(_empty())
            self._move_queue.append(_buttons(self.forward))
            return _buttons(self.forward)
        else:
            return _buttons(self.forward)

    def _attack(self, obs: SF2Observation, close: bool) -> np.ndarray:
        """Throw out an attack. Heavier attacks when close."""
        r = random.random()

        if close:
            if r < 0.15:
                # Throw attempt
                self._enqueue(_throw_frames(self.forward))
                return self._move_queue.popleft()
            elif r < 0.35:
                # Crouching heavy kick (sweep)
                return _buttons(BTN_DOWN, BTN_Z)
            elif r < 0.55:
                return _buttons(BTN_C)  # standing hard punch
            elif r < 0.70:
                return _buttons(BTN_Z)  # standing hard kick
            elif r < 0.85:
                # Crouching medium punch
                return _buttons(BTN_DOWN, BTN_B)
            else:
                return _buttons(BTN_Y)  # medium kick
        else:
            # Mid range — use medium / long-range pokes
            if r < 0.30:
                return _buttons(BTN_Y)  # medium kick (good range)
            elif r < 0.50:
                return _buttons(self.forward, BTN_Y)  # advancing medium kick
            elif r < 0.70:
                return _buttons(BTN_DOWN, BTN_Y)  # crouching medium kick
            elif r < 0.85:
                return _buttons(BTN_B)  # medium punch
            else:
                # Jump-in attack
                self._move_queue.append(_buttons(BTN_C))  # air heavy punch on way down
                self._move_queue.append(_empty())
                return _buttons(BTN_UP, self.forward)

    def _block(self) -> np.ndarray:
        """Crouch block (down-back) or stand block (back)."""
        r = random.random()
        if r < 0.6:
            # Crouch block (covers lows)
            return _buttons(BTN_DOWN, self.back)
        elif r < 0.85:
            # Stand block (covers overheads/jumps)
            return _buttons(self.back)
        else:
            # Block then counter with light attack (queue)
            self._move_queue.append(_buttons(BTN_DOWN, self.back))
            self._move_queue.append(_buttons(BTN_A))  # counter jab
            return _buttons(BTN_DOWN, self.back)

    def _special(self, obs: SF2Observation) -> np.ndarray:
        """Attempt a special move if off cooldown."""
        if self._frame - self._last_special_frame < self._special_cooldown:
            # On cooldown, throw a normal instead
            return _buttons(BTN_B)

        self._last_special_frame = self._frame

        r = random.random()
        if r < 0.40:
            # Hadouken (quarter circle forward + punch)
            punch = random.choice([BTN_A, BTN_B, BTN_C])
            self._enqueue(_hadouken_frames(self.forward, punch))
        elif r < 0.65:
            # Shoryuken (dragon punch)
            punch = random.choice([BTN_A, BTN_B, BTN_C])
            self._enqueue(_shoryuken_frames(self.forward, punch))
        elif r < 0.85:
            # Hurricane kick
            kick = random.choice([BTN_X, BTN_Y, BTN_Z])
            self._enqueue(_hurricane_kick_frames(self.back, kick))
        else:
            # Super attempt (double quarter circle + punch) — longer sequence
            frames = (
                _hadouken_frames(self.forward, BTN_C)[:-1]  # first QCF minus recovery
                + _hadouken_frames(self.forward, BTN_C)      # second QCF + punch
            )
            self._enqueue(frames)

        if self._move_queue:
            return self._move_queue.popleft()
        return _empty()

    def _retreat(self) -> np.ndarray:
        """Walk back or jump back."""
        r = random.random()
        if r < 0.2:
            return _buttons(BTN_UP, self.back)  # jump back
        else:
            return _buttons(self.back)  # walk back

    # ------------------------------------------------------------------
    # Queue helpers
    # ------------------------------------------------------------------

    def _enqueue(self, frames: list[np.ndarray]):
        """Push a multi-frame move sequence onto the queue."""
        for f in frames:
            self._move_queue.append(f)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def reset(self):
        """Reset state between rounds/matches."""
        self._frame = 0
        self._move_queue.clear()
        self._last_special_frame = -999

    def get_metadata(self) -> dict:
        return {
            "name": self.name,
            "model": "rule-based-sf2",
            "game": "street-fighter-2",
            "strategy": self.current_strategy,
            "player_index": self.player_index,
        }
