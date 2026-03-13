"""
Race result reader — reads final state from GameAdapter.
Imports ONLY from arena/adapters/base.py — never MK64-specific code.
"""
from __future__ import annotations
import logging
from arena.adapters.base import GameAdapter

logger = logging.getLogger(__name__)


async def read_race_result(adapter: GameAdapter) -> dict:
    """
    Read the final race result from the game adapter.
    Returns dict ready for EIP-712 signing by oracle/signer.py.
    """
    result = await adapter.get_race_result()
    logger.info(f"Race result read: matchId={result.get('matchId')}")
    return result


async def poll_race_state(adapter: GameAdapter, interval_ms: int = 100):
    """
    Async generator that yields race state dicts at the given interval.
    Used by broadcaster to push ticks to WebSocket clients.
    """
    import asyncio
    while True:
        state = await adapter.get_race_state()
        yield state
        if state.get("race_status") == "finished":
            break
        await asyncio.sleep(interval_ms / 1000)
