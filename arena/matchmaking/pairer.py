"""
Match pairing logic. Pairs agents from the queue into matches.
"""
from __future__ import annotations


def pair_agents(queue: list[str], min_players: int = 2, max_players: int = 4) -> list[list[str]]:
    """
    Pair agents from queue into matches.

    Args:
        queue: List of agent addresses in queue order.
        min_players: Minimum players per match.
        max_players: Maximum players per match.

    Returns:
        List of matches, each a list of agent addresses.
        Agents not yet paired remain in queue (not returned).
    """
    matches = []
    i = 0
    while i + min_players <= len(queue):
        match_size = min(max_players, len(queue) - i)
        if match_size >= min_players:
            matches.append(queue[i:i + match_size])
            i += match_size
        else:
            break
    return matches
