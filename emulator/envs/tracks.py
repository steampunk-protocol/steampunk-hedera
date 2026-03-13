"""
Track and character mappings for stable-retro MK64 environment.

Maps internal track_id to display names. Track selection in stable-retro
is handled via save states, not gym env names.

Only Luigi Raceway is enabled for the first pass. Others are listed
but will raise NotImplementedError until tested in Docker.
"""

from __future__ import annotations

# track_id -> stable-retro state name (reserved for future save-state selection)
TRACK_MAP: dict[int, str] = {
    0: "Luigi-Raceway",
    # Uncomment as each track is tested in Docker:
    # 1: "Moo-Moo-Farm",
    # 2: "Koopa-Beach",
    # 3: "Kalimari-Desert",
    # 4: "Toads-Turnpike",
    # 5: "Frappe-Snowland",
    # 6: "Choco-Mountain",
    # 7: "Mario-Raceway",
    # 8: "Wario-Stadium",
    # 9: "Sherbet-Land",
    # 10: "Royal-Raceway",
    # 11: "Bowsers-Castle",
    # 12: "DKs-Jungle-Parkway",
    # 13: "Yoshi-Valley",
    # 14: "Banshee-Boardwalk",
    # 15: "Rainbow-Road",
}

# Human-readable track names for logging
TRACK_NAMES: dict[int, str] = {
    0: "Luigi Raceway",
    1: "Moo Moo Farm",
    2: "Koopa Beach",
    3: "Kalimari Desert",
    4: "Toad's Turnpike",
    5: "Frappe Snowland",
    6: "Choco Mountain",
    7: "Mario Raceway",
    8: "Wario Stadium",
    9: "Sherbet Land",
    10: "Royal Raceway",
    11: "Bowser's Castle",
    12: "DK's Jungle Parkway",
    13: "Yoshi Valley",
    14: "Banshee Boardwalk",
    15: "Rainbow Road",
}


def get_track_state_name(track_id: int) -> str:
    """
    Get the stable-retro state name for a track.

    Args:
        track_id: Internal track ID (0-based).

    Returns:
        State name string like 'Luigi-Raceway'.

    Raises:
        NotImplementedError: If track is not yet tested/enabled.
    """
    if track_id not in TRACK_MAP:
        track_name = TRACK_NAMES.get(track_id, f"Unknown({track_id})")
        raise NotImplementedError(
            f"Track '{track_name}' (id={track_id}) is not yet enabled. "
            f"Only Luigi Raceway (id=0) is tested."
        )
    return TRACK_MAP[track_id]
