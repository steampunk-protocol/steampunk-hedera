"""
StreetFighter2RetroEnv — 2-player Street Fighter II environment using stable-retro.

Uses Genesis/Mega Drive core. ROM must be imported into stable-retro before use:
    python -m retro.import /path/to/streetfighter2_special_champion_edition.bin

Exposes game state via RAM address map (data.json):
    health, enemy_health, matches_won, enemy_matches_won, score, continuetimer

Genesis button layout per player (12 buttons each):
    B(0)=med_punch, A(1)=light_punch, MODE(2), START(3),
    UP(4), DOWN(5), LEFT(6), RIGHT(7),
    C(8)=hard_punch, Y(9)=med_kick, X(10)=light_kick, Z(11)=hard_kick
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# stable-retro optional import — module still loadable without it (stub mode)
try:
    import retro
    RETRO_AVAILABLE = not os.environ.get("EMULATOR_STUB_MODE", "").strip() in (
        "1", "true", "yes",
    )
    if not RETRO_AVAILABLE:
        logger.info("EMULATOR_STUB_MODE=1 — running in stub mode (no Genesis emulation)")
except ImportError:
    RETRO_AVAILABLE = False
    logger.warning(
        "stable-retro not installed — StreetFighter2RetroEnv will run in stub mode"
    )

GAME_NAME = "StreetFighterIISpecialChampionEdition-Genesis"
DEFAULT_STATE = "Champion.Level1.RyuVsGuile"

MAX_HEALTH = 176
WINS_TO_MATCH = 2  # best of 3 rounds


# ---------------------------------------------------------------------------
# SF2 Observation
# ---------------------------------------------------------------------------

@dataclass
class SF2Observation:
    """Per-agent observation from the SF2 environment."""

    agent_id: str
    health: int             # 0–176
    enemy_health: int       # 0–176
    matches_won: int        # rounds won this match (0–2)
    enemy_matches_won: int
    round: int              # current round number (1-indexed)
    finished: bool          # True when match is over (someone reached 2 wins)
    frame: Optional[np.ndarray] = None  # (200, 256, 3) RGB if captured


# ---------------------------------------------------------------------------
# SF2 Actions
# ---------------------------------------------------------------------------

class SF2Move(Enum):
    """High-level fighting game actions mapped to Genesis button combos."""

    # Movement
    IDLE = "idle"
    MOVE_LEFT = "move_left"
    MOVE_RIGHT = "move_right"
    JUMP = "jump"
    CROUCH = "crouch"
    JUMP_LEFT = "jump_left"
    JUMP_RIGHT = "jump_right"

    # Attacks
    LIGHT_PUNCH = "light_punch"       # A
    MEDIUM_PUNCH = "medium_punch"     # B
    HARD_PUNCH = "hard_punch"         # C
    LIGHT_KICK = "light_kick"         # X
    MEDIUM_KICK = "medium_kick"       # Y
    HARD_KICK = "hard_kick"           # Z

    # Crouching attacks
    CROUCH_LIGHT_PUNCH = "crouch_light_punch"
    CROUCH_MEDIUM_PUNCH = "crouch_medium_punch"
    CROUCH_HARD_PUNCH = "crouch_hard_punch"
    CROUCH_LIGHT_KICK = "crouch_light_kick"
    CROUCH_MEDIUM_KICK = "crouch_medium_kick"
    CROUCH_HARD_KICK = "crouch_hard_kick"

    # Jumping attacks
    JUMP_LIGHT_PUNCH = "jump_light_punch"
    JUMP_MEDIUM_PUNCH = "jump_medium_punch"
    JUMP_HARD_PUNCH = "jump_hard_punch"
    JUMP_LIGHT_KICK = "jump_light_kick"
    JUMP_MEDIUM_KICK = "jump_medium_kick"
    JUMP_HARD_KICK = "jump_hard_kick"

    # Defense
    BLOCK_STANDING = "block_standing"   # hold back
    BLOCK_CROUCHING = "block_crouching"  # down + back


# Genesis button indices (per player, 12 buttons each)
# P1: 0-11, P2: 12-23
_B = 0    # medium punch
_A = 1    # light punch
_MODE = 2
_START = 3
_UP = 4
_DOWN = 5
_LEFT = 6
_RIGHT = 7
_C = 8    # hard punch
_Y = 9    # medium kick
_X = 10   # light kick
_Z = 11   # hard kick

BUTTONS_PER_PLAYER = 12
TOTAL_BUTTONS = BUTTONS_PER_PLAYER * 2  # 24


def _make_action(player: int, **buttons: bool) -> np.ndarray:
    """Build a 24-element MultiBinary action array for a given player (0 or 1)."""
    action = np.zeros(TOTAL_BUTTONS, dtype=np.int8)
    offset = player * BUTTONS_PER_PLAYER
    name_to_idx = {
        "A": _A, "B": _B, "C": _C,
        "X": _X, "Y": _Y, "Z": _Z,
        "UP": _UP, "DOWN": _DOWN, "LEFT": _LEFT, "RIGHT": _RIGHT,
        "START": _START, "MODE": _MODE,
    }
    for name, pressed in buttons.items():
        if pressed and name in name_to_idx:
            action[offset + name_to_idx[name]] = 1
    return action


def _move_to_buttons(move: SF2Move, facing_right: bool = True) -> dict[str, bool]:
    """
    Convert an SF2Move to Genesis button presses.

    facing_right: if True, "forward" = RIGHT, "back" = LEFT.
    Agents should set this based on relative position to opponent.
    """
    fwd = "RIGHT" if facing_right else "LEFT"
    back = "LEFT" if facing_right else "RIGHT"

    mapping: dict[SF2Move, dict[str, bool]] = {
        SF2Move.IDLE: {},
        SF2Move.MOVE_LEFT: {"LEFT": True},
        SF2Move.MOVE_RIGHT: {"RIGHT": True},
        SF2Move.JUMP: {"UP": True},
        SF2Move.CROUCH: {"DOWN": True},
        SF2Move.JUMP_LEFT: {"UP": True, "LEFT": True},
        SF2Move.JUMP_RIGHT: {"UP": True, "RIGHT": True},
        # Standing attacks
        SF2Move.LIGHT_PUNCH: {"A": True},
        SF2Move.MEDIUM_PUNCH: {"B": True},
        SF2Move.HARD_PUNCH: {"C": True},
        SF2Move.LIGHT_KICK: {"X": True},
        SF2Move.MEDIUM_KICK: {"Y": True},
        SF2Move.HARD_KICK: {"Z": True},
        # Crouching attacks
        SF2Move.CROUCH_LIGHT_PUNCH: {"DOWN": True, "A": True},
        SF2Move.CROUCH_MEDIUM_PUNCH: {"DOWN": True, "B": True},
        SF2Move.CROUCH_HARD_PUNCH: {"DOWN": True, "C": True},
        SF2Move.CROUCH_LIGHT_KICK: {"DOWN": True, "X": True},
        SF2Move.CROUCH_MEDIUM_KICK: {"DOWN": True, "Y": True},
        SF2Move.CROUCH_HARD_KICK: {"DOWN": True, "Z": True},
        # Jumping attacks
        SF2Move.JUMP_LIGHT_PUNCH: {"UP": True, "A": True},
        SF2Move.JUMP_MEDIUM_PUNCH: {"UP": True, "B": True},
        SF2Move.JUMP_HARD_PUNCH: {"UP": True, "C": True},
        SF2Move.JUMP_LIGHT_KICK: {"UP": True, "X": True},
        SF2Move.JUMP_MEDIUM_KICK: {"UP": True, "Y": True},
        SF2Move.JUMP_HARD_KICK: {"UP": True, "Z": True},
        # Defense
        SF2Move.BLOCK_STANDING: {back: True},
        SF2Move.BLOCK_CROUCHING: {"DOWN": True, back: True},
    }
    return mapping.get(move, {})


def sf2_move_to_action(move: SF2Move, player: int, facing_right: bool = True) -> np.ndarray:
    """
    Convert a high-level SF2Move to a 24-element stable-retro action array.

    Args:
        move: The high-level move to perform.
        player: 0 for P1, 1 for P2.
        facing_right: Whether the player is facing right (affects block direction).

    Returns:
        numpy array of shape (24,) with button states.
    """
    buttons = _move_to_buttons(move, facing_right)
    return _make_action(player, **buttons)


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

class StreetFighter2RetroEnv:
    """
    2-player Street Fighter II environment wrapping stable-retro.

    In real mode: uses retro.make() with native 2-player support.
    In stub mode: returns synthetic observations (stable-retro not installed).

    The Genesis version runs both players in a single env instance — no need
    for separate processes. Actions are a single 24-element array (12 per player).
    """

    def __init__(
        self,
        render_mode: str = "rgb_array",
        state: str = DEFAULT_STATE,
    ):
        self.render_mode = render_mode
        self.state = state

        self._env = None
        self._frame: Optional[np.ndarray] = None  # (200, 256, 3) RGB
        self._info: dict = {}
        self._step_count = 0

        # Track round progression
        self._p1_wins = 0
        self._p2_wins = 0
        self._current_round = 1
        self._match_over = False

    # -- Lifecycle -------------------------------------------------------------

    def reset(self) -> dict[str, SF2Observation]:
        """
        Initialize the environment and return initial observations for both players.

        Returns:
            Dict mapping agent_id to SF2Observation for "agent_0" and "agent_1".
        """
        self._step_count = 0
        self._p1_wins = 0
        self._p2_wins = 0
        self._current_round = 1
        self._match_over = False

        if not RETRO_AVAILABLE:
            logger.warning("stable-retro unavailable — returning stub reset observations")
            return self._stub_observations()

        if self._env is not None:
            self._env.close()

        try:
            self._env = retro.make(
                game=f"{GAME_NAME}-v0",
                players=2,
                state=self.state,
                render_mode=self.render_mode,
            )
        except Exception as e:
            logger.error(f"retro.make({GAME_NAME!r}) failed: {e}")
            raise RuntimeError(
                f"Failed to create stable-retro env for {GAME_NAME}. "
                "Ensure ROM is imported: "
                "python -m retro.import /path/to/rom_directory"
            ) from e

        obs, self._info = self._env.reset()
        self._frame = obs if isinstance(obs, np.ndarray) else None
        logger.info(f"StreetFighter2RetroEnv reset (state={self.state})")
        return self._build_observations()

    def step(
        self,
        actions: dict[str, np.ndarray],
    ) -> tuple[dict[str, SF2Observation], dict[str, float], bool, dict]:
        """
        Advance the emulator by one frame with both players' actions.

        Args:
            actions: Dict mapping agent_id ("agent_0", "agent_1") to 24-element
                     button arrays. Use sf2_move_to_action() to build these.

        Returns:
            (observations, rewards, done, info)
            - observations: dict of agent_id → SF2Observation
            - rewards: dict of agent_id → float
            - done: True when match is over (one player has 2 wins)
            - info: raw info dict from stable-retro
        """
        if not RETRO_AVAILABLE or self._env is None:
            return self._stub_step()

        # Merge P1 and P2 actions into single 24-element array
        # Agents return 12-button arrays; we place them into the correct half
        p1_action = actions.get("agent_0", np.zeros(BUTTONS_PER_PLAYER, dtype=np.int8))
        p2_action = actions.get("agent_1", np.zeros(BUTTONS_PER_PLAYER, dtype=np.int8))
        combined = np.zeros(TOTAL_BUTTONS, dtype=np.int8)
        combined[:BUTTONS_PER_PLAYER] = p1_action[:BUTTONS_PER_PLAYER]
        combined[BUTTONS_PER_PLAYER:] = p2_action[:BUTTONS_PER_PLAYER]

        obs, reward, terminated, truncated, info = self._env.step(combined)
        self._frame = obs if isinstance(obs, np.ndarray) else None
        self._info = info
        self._step_count += 1

        # Update round/win tracking from RAM
        self._update_match_state(info)

        observations = self._build_observations()
        done = terminated or truncated or self._match_over

        # Reward: health differential (positive = good for that player)
        p1_health = int(info.get("health", 0))
        p2_health = int(info.get("enemy_health", 0))
        rewards = {
            "agent_0": float(p1_health - p2_health),
            "agent_1": float(p2_health - p1_health),
        }

        # Bonus for winning the match
        if self._match_over:
            if self._p1_wins >= WINS_TO_MATCH:
                rewards["agent_0"] += 1000.0
                rewards["agent_1"] -= 1000.0
            elif self._p2_wins >= WINS_TO_MATCH:
                rewards["agent_1"] += 1000.0
                rewards["agent_0"] -= 1000.0

        return observations, rewards, done, info

    def close(self) -> None:
        """Release the emulator instance."""
        if self._env is not None:
            try:
                self._env.close()
                logger.info("StreetFighter2RetroEnv closed")
            except Exception as e:
                logger.warning(f"Error closing env: {e}")
            self._env = None

    # -- Frame capture ---------------------------------------------------------

    def get_frame(self) -> Optional[np.ndarray]:
        """
        Get the current frame as a numpy RGB array.

        Returns:
            numpy array of shape (200, 256, 3) dtype uint8, or None if unavailable.
        """
        if self._frame is not None:
            return self._frame.copy()
        return None

    # -- Match state tracking --------------------------------------------------

    def _update_match_state(self, info: dict) -> None:
        """Track round wins and detect match completion from RAM values."""
        p1_wins = int(info.get("matches_won", 0))
        p2_wins = int(info.get("enemy_matches_won", 0))

        # Detect round transition
        if p1_wins > self._p1_wins or p2_wins > self._p2_wins:
            self._current_round += 1

        self._p1_wins = p1_wins
        self._p2_wins = p2_wins

        if self._p1_wins >= WINS_TO_MATCH or self._p2_wins >= WINS_TO_MATCH:
            self._match_over = True

    # -- Observations ----------------------------------------------------------

    def _build_observations(self) -> dict[str, SF2Observation]:
        """Build observations for both players from stable-retro info dict."""
        p1_health = int(self._info.get("health", MAX_HEALTH))
        p2_health = int(self._info.get("enemy_health", MAX_HEALTH))

        p1_health = max(0, min(MAX_HEALTH, p1_health))
        p2_health = max(0, min(MAX_HEALTH, p2_health))

        return {
            "agent_0": SF2Observation(
                agent_id="agent_0",
                health=p1_health,
                enemy_health=p2_health,
                matches_won=self._p1_wins,
                enemy_matches_won=self._p2_wins,
                round=self._current_round,
                finished=self._match_over,
                frame=self._frame,
            ),
            "agent_1": SF2Observation(
                agent_id="agent_1",
                health=p2_health,
                enemy_health=p1_health,
                matches_won=self._p2_wins,
                enemy_matches_won=self._p1_wins,
                round=self._current_round,
                finished=self._match_over,
                frame=self._frame,
            ),
        }

    # -- Stub mode -------------------------------------------------------------

    def _stub_observations(self) -> dict[str, SF2Observation]:
        """Synthetic observations when stable-retro is unavailable."""
        return {
            "agent_0": SF2Observation(
                agent_id="agent_0",
                health=MAX_HEALTH,
                enemy_health=MAX_HEALTH,
                matches_won=0,
                enemy_matches_won=0,
                round=1,
                finished=False,
            ),
            "agent_1": SF2Observation(
                agent_id="agent_1",
                health=MAX_HEALTH,
                enemy_health=MAX_HEALTH,
                matches_won=0,
                enemy_matches_won=0,
                round=1,
                finished=False,
            ),
        }

    def _stub_step(self) -> tuple[dict[str, SF2Observation], dict[str, float], bool, dict]:
        """
        Synthetic step for stub mode.
        Simulates a 3-round match over ~1800 frames (30s at 60fps).
        """
        self._step_count += 1
        frames_per_round = 600  # ~10s per round

        round_frame = self._step_count % frames_per_round
        current_round_idx = min(self._step_count // frames_per_round, 4)

        # Simulate health draining — P1 slightly favored
        p1_drain = round_frame * 0.25
        p2_drain = round_frame * 0.30
        p1_health = max(0, int(MAX_HEALTH - p1_drain))
        p2_health = max(0, int(MAX_HEALTH - p2_drain))

        # Round ends when someone hits 0
        if round_frame >= frames_per_round - 1:
            if current_round_idx % 2 == 0:
                self._p1_wins = min(self._p1_wins + 1, WINS_TO_MATCH)
            else:
                self._p2_wins = min(self._p2_wins + 1, WINS_TO_MATCH)
            self._current_round = current_round_idx + 2

        if self._p1_wins >= WINS_TO_MATCH or self._p2_wins >= WINS_TO_MATCH:
            self._match_over = True

        observations = {
            "agent_0": SF2Observation(
                agent_id="agent_0",
                health=p1_health,
                enemy_health=p2_health,
                matches_won=self._p1_wins,
                enemy_matches_won=self._p2_wins,
                round=self._current_round,
                finished=self._match_over,
            ),
            "agent_1": SF2Observation(
                agent_id="agent_1",
                health=p2_health,
                enemy_health=p1_health,
                matches_won=self._p2_wins,
                enemy_matches_won=self._p1_wins,
                round=self._current_round,
                finished=self._match_over,
            ),
        }

        rewards = {
            "agent_0": float(p1_health - p2_health),
            "agent_1": float(p2_health - p1_health),
        }

        if self._match_over:
            if self._p1_wins >= WINS_TO_MATCH:
                rewards["agent_0"] += 1000.0
                rewards["agent_1"] -= 1000.0
            else:
                rewards["agent_1"] += 1000.0
                rewards["agent_0"] -= 1000.0

        return observations, rewards, self._match_over, {}

    # -- Properties ------------------------------------------------------------

    @property
    def action_space(self):
        """stable-retro action space (MultiBinary(24) for 2 players)."""
        if self._env is not None:
            return self._env.action_space
        return None

    @property
    def observation_space(self):
        """stable-retro observation space (pixel RGB)."""
        if self._env is not None:
            return self._env.observation_space
        return None

    @property
    def winner(self) -> Optional[str]:
        """Return the winning agent_id, or None if match not over."""
        if not self._match_over:
            return None
        return "agent_0" if self._p1_wins >= WINS_TO_MATCH else "agent_1"
