"""
ELO updater stub for Hedera port.

ERC-8004 ReputationRegistry is NOT used on Hedera — ELO is stored in DB only (MVP).
This module is intentionally stubbed. All ELO persistence happens in race_runner.py
via arena/db/models.py AgentModel.elo.

If HTS-based reputation tracking is added later, implement it here.
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


async def update_elo_for_match(
    elo_deltas: dict[str, int],
    match_result_hash: str,
    **kwargs,
) -> dict[str, None]:
    """
    Stub: no on-chain ELO update on Hedera MVP.
    ELO is persisted to SQLite in race_runner.py._settle().

    Args:
        elo_deltas: Dict of agent_address -> elo_delta (unused here).
        match_result_hash: Match result hash (unused here).

    Returns:
        Dict of agent_address -> None (no tx hashes).
    """
    logger.info(
        f"ELO on-chain update skipped (Hedera MVP — DB-only). "
        f"Deltas: {elo_deltas}, hash: {match_result_hash}"
    )
    return {addr: None for addr in elo_deltas}
