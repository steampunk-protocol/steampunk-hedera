"""
Pixel-based game state detection for Mario Kart 64.

Game state is extracted by sampling specific pixel coordinates from the
rendered frame. Used as fallback when RAM reads are unavailable.

Constants sourced from gym-mupen64plus and MK64RAM (mariokart64.py).
"""

from __future__ import annotations

import numpy as np

# Pixel coordinates for state detection (CONFIRMED from gym-mupen64plus)
LAP_PIXEL_COORD = (203, 50)       # (x, y) — color encodes current lap
RACE_END_PIXEL_COORD = (203, 51)  # (x, y) — color indicates race finished

# Lap number by pixel color at LAP_PIXEL_COORD
LAP_COLOR_MAP: dict[tuple[int, int, int], int] = {
    (0, 0, 255): 1,      # Blue   -> Lap 1
    (255, 255, 0): 2,     # Yellow -> Lap 2
    (255, 0, 0): 3,       # Red    -> Lap 3
}

# Race-end pixel colors vary by video plugin.
# We detect "end" when the lap pixel no longer matches any known lap color
# AND the race-end pixel matches one of these plugin-specific signatures.
RACE_END_COLORS: dict[str, tuple[int, int, int]] = {
    "rice": (66, 49, 66),
    "glide64mk2": (214, 148, 214),
    "glide64": (157, 112, 158),
}

# Color matching tolerance per channel (video plugins may shift colors slightly)
COLOR_TOLERANCE = 10


def _color_distance(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> int:
    """Max per-channel distance between two RGB colors."""
    return max(abs(a - b) for a, b in zip(c1, c2))


def detect_lap(frame: np.ndarray) -> int:
    """
    Detect current lap from a rendered frame.

    Args:
        frame: RGB numpy array, shape (H, W, 3).

    Returns:
        Lap number (1, 2, or 3). Returns 1 if color unrecognized.
    """
    x, y = LAP_PIXEL_COORD
    if frame.shape[0] <= y or frame.shape[1] <= x:
        return 1

    pixel = tuple(int(c) for c in frame[y, x, :3])

    for color, lap in LAP_COLOR_MAP.items():
        if _color_distance(pixel, color) <= COLOR_TOLERANCE:
            return lap

    return 1  # default to lap 1 if color unrecognized


def detect_race_end(frame: np.ndarray) -> bool:
    """
    Detect if the race has ended from a rendered frame.

    The race is considered over when the race-end pixel matches any
    known plugin-specific finish color.

    Args:
        frame: RGB numpy array, shape (H, W, 3).

    Returns:
        True if race appears to have ended.
    """
    x, y = RACE_END_PIXEL_COORD
    if frame.shape[0] <= y or frame.shape[1] <= x:
        return False

    pixel = tuple(int(c) for c in frame[y, x, :3])

    for color in RACE_END_COLORS.values():
        if _color_distance(pixel, color) <= COLOR_TOLERANCE:
            return True

    return False
