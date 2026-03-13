"""
Elo rating calculator for multi-player races.
Single source of truth — never duplicate in contracts or frontend.

For multi-player (N agents), treat each pair as an independent 1v1 result.
"""
from __future__ import annotations
import os
import logging

logger = logging.getLogger(__name__)

# K-factor: controls how much ratings change per match
# Tunable via env var
DEFAULT_K = 32


def get_k_factor() -> int:
    return int(os.environ.get("ELO_K_FACTOR", DEFAULT_K))


def expected_score(rating_a: int, rating_b: int) -> float:
    """Standard Elo expected score for player A against player B."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def elo_delta_1v1(rating_winner: int, rating_loser: int, k: int) -> tuple[int, int]:
    """
    Compute Elo deltas for a 1v1 result.

    Returns:
        (winner_delta, loser_delta) — winner gains, loser loses.
    """
    e_winner = expected_score(rating_winner, rating_loser)
    e_loser = expected_score(rating_loser, rating_winner)
    winner_delta = round(k * (1.0 - e_winner))
    loser_delta = round(k * (0.0 - e_loser))
    return winner_delta, loser_delta


def calculate_elo_deltas(
    agents: list[str],
    final_positions: list[int],
    current_ratings: dict[str, int],
) -> dict[str, int]:
    """
    Calculate Elo deltas for a multi-player race.

    Strategy: treat each pair of players as independent 1v1 results.
    Sum all pairwise deltas for each player.

    Args:
        agents: List of agent addresses in slot order (len 2-4).
        final_positions: List of final positions per slot (1=1st, 0=DNF).
        current_ratings: Dict of agent_address -> current Elo rating.
                         Missing agents default to 1200.

    Returns:
        Dict of agent_address -> elo_delta (positive = gain, negative = loss).
        DNF agents (position=0) are treated as last place.
    """
    k = get_k_factor()

    # Filter to active agents (non-zero address)
    active = [
        (addr, pos)
        for addr, pos in zip(agents, final_positions)
        if addr and addr != "0x" + "0" * 40
    ]

    if len(active) < 2:
        logger.warning("Less than 2 active agents — no Elo update")
        return {}

    # Treat DNF (position=0) as last place
    max_pos = max(pos for _, pos in active if pos > 0) + 1
    normalized = [
        (addr, pos if pos > 0 else max_pos)
        for addr, pos in active
    ]

    deltas: dict[str, int] = {addr: 0 for addr, _ in normalized}

    # All pairs
    for i in range(len(normalized)):
        for j in range(i + 1, len(normalized)):
            addr_a, pos_a = normalized[i]
            addr_b, pos_b = normalized[j]
            rating_a = current_ratings.get(addr_a, 1200)
            rating_b = current_ratings.get(addr_b, 1200)

            if pos_a < pos_b:
                # A beat B
                d_a, d_b = elo_delta_1v1(rating_a, rating_b, k)
            elif pos_b < pos_a:
                # B beat A
                d_b, d_a = elo_delta_1v1(rating_b, rating_a, k)
            else:
                # Tie (shouldn't happen in MK64 but handle gracefully)
                d_a, d_b = 0, 0

            deltas[addr_a] += d_a
            deltas[addr_b] += d_b

    logger.info(f"Elo deltas: {deltas}")
    return deltas
