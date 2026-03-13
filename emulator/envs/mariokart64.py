"""
Single-agent Mario Kart 64 environment wrapper.

IMPORTANT: gym-mupen64plus uses screen pixel detection for game state,
NOT direct RAM reads. The RAM addresses below are sourced from community
research and are UNCONFIRMED until verified against a running MK64 instance.

Single source of truth for all RAM address reads — never duplicate in arena or frontend.
"""

from __future__ import annotations
import os
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

# =============================================================================
# MK64 RAM ADDRESSES
# These are offsets into N64 RDRAM. Mupen64Plus reads via memory plugin.
#
# For true RAM-based multi-agent state extraction, we need either:
# 1. A custom mupen64plus Lua script that exposes memory over a socket
# 2. A mupen64plus debugger plugin with memory read API
# 3. Process memory reading (ptrace/ReadProcessMemory on the emulator pid)
#
# The addresses below come from community MK64 RAM research.
# Status: UNCONFIRMED — must be verified in Docker.
# =============================================================================

class MK64RAM:
    """
    Mario Kart 64 RAM address map.
    All addresses are RDRAM offsets for mupen64plus memory reads.

    Status key:
    CONFIRMED  = verified in gym-mupen64plus source or against live emulator
    UNCONFIRMED = need to find via memory search
    """

    # --- Player 1 base address (other players offset by 0x100 each) ---
    PLAYER_BASE = [0x800F71B8, 0x800F72B8, 0x800F73B8, 0x800F74B8]  # UNCONFIRMED

    # --- Race position (1-4) ---
    RACE_POSITION = [0x800F7EEC, 0x800F7EF0, 0x800F7EF4, 0x800F7EF8]  # UNCONFIRMED

    # --- Lap counter (0-2 internally, display as 1-3) ---
    LAP_COUNT = [0x800F7644, 0x800F7744, 0x800F7844, 0x800F7944]  # UNCONFIRMED

    # --- X/Y position on track ---
    PLAYER_X = [0x800F71B8, 0x800F72B8, 0x800F73B8, 0x800F74B8]  # UNCONFIRMED
    PLAYER_Y = [0x800F71BC, 0x800F72BC, 0x800F73BC, 0x800F74BC]  # UNCONFIRMED

    # --- Speed ---
    PLAYER_SPEED = [0x800F71D0, 0x800F72D0, 0x800F73D0, 0x800F74D0]  # UNCONFIRMED

    # --- Item held (0x00 = none) ---
    ITEM_HELD = [0x800F7648, 0x800F7748, 0x800F7848, 0x800F7948]  # UNCONFIRMED

    # --- Race completion flag ---
    RACE_FINISHED = 0x800F7F4C  # UNCONFIRMED

    # --- Race time (centiseconds) ---
    RACE_TIME = 0x800F7B5C  # UNCONFIRMED

    # --- Pixel-based detection (CONFIRMED — from gym-mupen64plus source) ---
    LAP_PIXEL_COORD = (203, 50)  # CONFIRMED
    RACE_END_PIXEL_COORD = (203, 51)  # CONFIRMED
    LAP_COLOR_MAP = {
        (0, 0, 255): 1,
        (255, 255, 0): 2,
        (255, 0, 0): 3,
    }  # CONFIRMED

    # Item ID -> name mapping
    ITEM_NAMES = {
        0x00: None,
        0x01: "banana",
        0x02: "triple_banana",
        0x03: "green_shell",
        0x04: "triple_green_shell",
        0x05: "red_shell",
        0x06: "triple_red_shell",
        0x07: "bob_omb",
        0x08: "mushroom",
        0x09: "triple_mushroom",
        0x0A: "golden_mushroom",
        0x0B: "star",
        0x0C: "boo",
        0x0D: "lightning",
        0x0E: "blue_shell",
    }


# Try to import gym-mupen64plus; fail gracefully if not installed
try:
    import gym_mupen64plus  # noqa: F401
    GYM_AVAILABLE = True
except ImportError:
    GYM_AVAILABLE = False
    logger.warning(
        "gym-mupen64plus not installed. "
        "Emulator functionality unavailable. "
        "Install inside Docker: pip install git+https://github.com/bzier/gym-mupen64plus.git"
    )


class MarioKart64Env:
    """
    Single-agent MK64 environment.
    Thin wrapper around gym-mupen64plus that extracts typed observations.

    Extended by MarioKart64MultiAgentEnv (emulator/envs/mariokart64_multi.py).
    """

    def __init__(self, player_index: int = 0):
        self.player_index = player_index
        self.rom_path = os.environ.get("MK64_ROM_PATH", "")
        if not self.rom_path:
            raise ValueError("MK64_ROM_PATH environment variable must be set")

        self._env = None  # initialized in reset()

    def reset(self):
        """Initialize/reset the environment."""
        if not GYM_AVAILABLE:
            raise RuntimeError("gym-mupen64plus not available")
        pass

    def read_observation(self, player_idx: int) -> dict:
        """
        Read raw observation for the given player slot (0-3).
        Returns dict with all known game state values.

        This is the ONLY place game state reads happen. Never duplicate in arena.
        """
        # Stub — real implementation reads from mupen64plus memory plugin
        return {
            "player_idx": player_idx,
            "x": 0.0,
            "y": 0.0,
            "position": 1,
            "lap": 1,
            "speed": 0.0,
            "item_id": 0,
            "lap_time_ms": 0,
            "race_time_ms": 0,
            "finished": False,
            "finish_time_ms": 0,
        }

    def close(self):
        if self._env:
            self._env.close()
