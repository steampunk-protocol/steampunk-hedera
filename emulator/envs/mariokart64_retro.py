"""
MarioKart64RetroEnv — single-agent Mario Kart 64 environment using stable-retro.

Uses mupen64plus-next libretro core. ROM must be imported into stable-retro before use:
    python -m retro.import emulator/envs/data/MarioKart64-N64 /path/to/mario_kart_64.z64

Exposes game state via RDRAM address map (data.json):
    position, lap, speed, x, y, z, finished
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import numpy as np

from emulator.agents.base import Observation

logger = logging.getLogger(__name__)

# stable-retro optional import — module still loadable without it (stub mode)
# Force stub mode via EMULATOR_STUB_MODE=1 env var when RAM addresses are unverified
try:
    import retro
    RETRO_AVAILABLE = not os.environ.get("EMULATOR_STUB_MODE", "").strip() in ("1", "true", "yes")
    if not RETRO_AVAILABLE:
        logger.info("EMULATOR_STUB_MODE=1 — running in stub mode (no real N64 emulation)")
except ImportError:
    RETRO_AVAILABLE = False
    logger.warning("stable-retro not installed — MarioKart64RetroEnv will run in stub mode")

GAME_NAME = "MarioKart64-N64"


class MarioKart64RetroEnv:
    """
    Single-agent MK64 environment wrapping stable-retro.

    In real mode: uses retro.make(GAME_NAME) with RAM reads via data.json.
    In stub mode: returns synthetic observations (stable-retro not installed).

    Args:
        player_index: Agent slot (0-3) used for observation agent_id labeling.
        render_mode: "rgb_array" (default, headless) or "human" (window).
        total_laps: Expected race laps (used in Observation).
    """

    def __init__(
        self,
        player_index: int = 0,
        render_mode: str = "rgb_array",
        total_laps: int = 3,
    ):
        self.player_index = player_index
        self.render_mode = render_mode
        self.total_laps = total_laps

        self._env = None
        self._obs = None          # raw numpy obs from retro
        self._info: dict = {}
        self._step_count = 0
        self._start_step = 0

    # -- Lifecycle -------------------------------------------------------------

    def reset(self) -> Observation:
        """
        Load the ROM, reset the environment, return the first Observation.
        ROM must be registered with stable-retro (retro.import) before calling.
        """
        if not RETRO_AVAILABLE:
            logger.warning("stable-retro unavailable — returning stub reset observation")
            self._step_count = 0
            self._start_step = 0
            return self._stub_observation()

        if self._env is not None:
            self._env.close()

        try:
            # Use RAM obs mode to avoid GPU framebuffer requirement.
            # N64 parallel_n64 core defaults to HW rendering which fails
            # in headless Docker without GPU. RAM mode gives us full 8MB
            # RDRAM access for game state reads.
            self._env = retro.make(
                game=GAME_NAME,
                state=retro.State.NONE,
                obs_type=retro.Observations.RAM,
            )
            # Monkey-patch render() to no-op — parallel_n64 can't provide
            # a CPU framebuffer without angrylion renderer, and we only
            # need RAM reads for game state, not pixel observations.
            self._env.render = lambda *a, **kw: None
            self._env.get_screen = lambda *a, **kw: np.zeros(
                (240, 320, 3), dtype=np.uint8
            )
            logger.info("Using RAM-only mode (no pixel capture)")
        except RuntimeError as e:
            if "multiple emulator instances" in str(e).lower():
                # N64 core only supports one instance per process.
                # Additional players fall back to stub mode.
                logger.warning(
                    f"Cannot create second N64 instance (player_index={self.player_index}) "
                    "— falling back to stub mode for this player"
                )
                self._step_count = 0
                self._start_step = 0
                return self._stub_observation()
            logger.error(f"retro.make({GAME_NAME!r}) failed: {e}")
            raise RuntimeError(
                f"Failed to create stable-retro env for {GAME_NAME}. "
                "Ensure ROM is imported: python -m retro.import "
                "emulator/envs/data/MarioKart64-N64 /path/to/mario_kart_64.z64"
            ) from e
        except Exception as e:
            logger.error(f"retro.make({GAME_NAME!r}) failed: {e}")
            raise RuntimeError(
                f"Failed to create stable-retro env for {GAME_NAME}. "
                "Ensure ROM is imported: python -m retro.import "
                "emulator/envs/data/MarioKart64-N64 /path/to/mario_kart_64.z64"
            ) from e

        raw_obs, self._info = self._env.reset()
        self._obs = raw_obs
        self._step_count = 0
        self._start_step = 0
        logger.info(f"MarioKart64RetroEnv reset (player_index={self.player_index})")
        return self._build_observation()

    def step(self, action: np.ndarray) -> tuple[Observation, float, bool, dict]:
        """
        Advance the emulator by one frame.

        Args:
            action: numpy array of button states (stable-retro MultiBinary format).

        Returns:
            (observation, reward, done, info)
        """
        if not RETRO_AVAILABLE or self._env is None:
            self._step_count += 1
            obs = self._stub_observation()
            done = obs.finished
            reward = 100.0 if done else 0.0
            return obs, reward, done, {}

        raw_obs, reward, terminated, truncated, info = self._env.step(action)
        self._obs = raw_obs
        self._info = info
        self._step_count += 1

        obs = self._build_observation()
        done = terminated or truncated or obs.finished
        return obs, float(reward), done, info

    def close(self) -> None:
        """Release the emulator instance."""
        if self._env is not None:
            try:
                self._env.close()
                logger.info(f"MarioKart64RetroEnv closed (player_index={self.player_index})")
            except Exception as e:
                logger.warning(f"Error closing env: {e}")
            self._env = None

    # -- Observation -----------------------------------------------------------

    def _build_observation(self) -> Observation:
        """
        Build an Observation from stable-retro RAM reads (via info dict).
        stable-retro populates info with values from data.json automatically.
        """
        if self._info:
            raw_position = int(self._info.get("position", 0))
            raw_lap = int(self._info.get("lap", 1))
            raw_speed = float(self._info.get("speed", 0.0))
            raw_x = float(self._info.get("x", 0.0))
            raw_y = float(self._info.get("y", 0.0))
            raw_finished = bool(int(self._info.get("finished", 0)))
        else:
            raw_position = 0
            raw_lap = 1
            raw_speed = 0.0
            raw_x = 0.0
            raw_y = 0.0
            raw_finished = False

        # Clamp to valid ranges
        position = max(1, min(4, raw_position)) if raw_position > 0 else (self.player_index + 1)
        lap = max(1, min(self.total_laps, raw_lap))

        frame: Optional[np.ndarray] = None
        if self._obs is not None and isinstance(self._obs, np.ndarray):
            frame = self._obs

        return Observation(
            agent_id=f"agent_{self.player_index}",
            x=raw_x,
            y=raw_y,
            position=position,
            lap=lap,
            total_laps=self.total_laps,
            speed=raw_speed,
            item=None,
            lap_time_ms=self._step_count * 16,  # ~60fps = 16ms per frame
            race_time_ms=self._step_count * 16,
            finished=raw_finished,
            finish_time_ms=self._step_count * 16 if raw_finished else 0,
            frame=frame,
        )

    def _stub_observation(self) -> Observation:
        """
        Synthetic observation for when stable-retro is unavailable.
        Simulates a race finishing after ~10 seconds (600 frames at 60fps).
        """
        stub_finish_step = 600 + self.player_index * 60  # stagger finishes
        finished = self._step_count >= stub_finish_step
        lap = min(
            self.total_laps,
            1 + self._step_count * self.total_laps // stub_finish_step
        ) if stub_finish_step > 0 else 1

        return Observation(
            agent_id=f"agent_{self.player_index}",
            x=float(self.player_index * 100 + self._step_count % 500),
            y=float(self._step_count % 300),
            position=self.player_index + 1,
            lap=lap,
            total_laps=self.total_laps,
            speed=80.0 - self.player_index * 5,
            item=None,
            lap_time_ms=self._step_count * 16,
            race_time_ms=self._step_count * 16,
            finished=finished,
            finish_time_ms=self._step_count * 16 if finished else 0,
        )

    # -- Properties ------------------------------------------------------------

    @property
    def action_space(self):
        """stable-retro action space (MultiBinary)."""
        if self._env is not None:
            return self._env.action_space
        return None

    @property
    def observation_space(self):
        """stable-retro pixel observation space."""
        if self._env is not None:
            return self._env.observation_space
        return None
