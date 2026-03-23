"""
On-chain lifecycle helpers for PredictionPool and Wager contracts.
Uses Node.js subprocess (ethers.js) for Hedera JSON-RPC relay compatibility.

PredictionPool phases:
  1. createPool(matchId, agents)  — when match is created (queue.py)
  2. lockPool(matchId)            — when match starts (race_runner.py)
  3. settlePool(matchId, winner)  — when match settles (race_runner.py)

Wager phases:
  1. createWager(matchId, agents, amount) + depositFor — when match is created
  2. settleWager(matchId, winner)                      — when match settles
"""
from __future__ import annotations
import logging
import os

from arena.hcs.contract_call import call_contract
from arena.utils import match_id_to_uint256

logger = logging.getLogger(__name__)


def _pool_addr() -> str:
    return os.environ.get("PREDICTION_POOL_ADDRESS", "")


def _wager_addr() -> str:
    return os.environ.get("WAGER_ADDRESS", "")


# ── PredictionPool ──────────────────────────────────────────────────────────

async def create_pool_on_chain(match_id: str, agents: list[str]) -> None:
    addr = _pool_addr()
    if not addr:
        logger.warning("PREDICTION_POOL_ADDRESS not set — skipping createPool")
        return
    numeric = str(match_id_to_uint256(match_id))
    clean_agents = [a for a in agents if a != "0x" + "0" * 40]
    result = await call_contract("createPool", addr, numeric, *clean_agents)
    if result and result.get("ok"):
        logger.info(f"createPool succeeded: match={match_id}, tx={result.get('tx')}")
    else:
        logger.error(f"createPool failed for match {match_id}")


async def lock_pool_on_chain(match_id: str) -> None:
    addr = _pool_addr()
    if not addr:
        return
    numeric = str(match_id_to_uint256(match_id))
    result = await call_contract("lockPool", addr, numeric)
    if result and result.get("ok"):
        logger.info(f"lockPool succeeded: match={match_id}, tx={result.get('tx')}")


async def settle_pool_on_chain(match_id: str, numeric_match_id: int, winner_address: str) -> None:
    addr = _pool_addr()
    if not addr or not winner_address:
        return
    result = await call_contract("settlePool", addr, str(numeric_match_id), winner_address)
    if result and result.get("ok"):
        logger.info(f"settlePool succeeded: match={match_id}, tx={result.get('tx')}")


# ── Wager ───────────────────────────────────────────────────────────────────

async def create_wager_on_chain(match_id: str, agents: list[str], wager_amount_raw: int) -> None:
    addr = _wager_addr()
    if not addr:
        logger.warning("WAGER_ADDRESS not set — skipping createWager")
        return
    if wager_amount_raw <= 0:
        logger.info("Wager amount is 0 — skipping createWager")
        return

    numeric = str(match_id_to_uint256(match_id))
    clean_agents = [a for a in agents if a != "0x" + "0" * 40]
    if len(clean_agents) < 2:
        return

    # 1. Create the wager match
    result = await call_contract("createWager", addr, numeric, clean_agents[0], clean_agents[1], str(wager_amount_raw))
    if not result or not result.get("ok"):
        logger.error(f"createWager failed for match {match_id}")
        return
    logger.info(f"createWager succeeded: match={match_id}, tx={result.get('tx')}")

    # 2. Approve STEAM + deposit for both agents
    dep_result = await call_contract("approveAndDeposit", addr, numeric, clean_agents[0], clean_agents[1], str(wager_amount_raw))
    if dep_result and dep_result.get("ok"):
        logger.info(f"deposits succeeded: match={match_id}, deposits={dep_result.get('deposits')}")
    else:
        logger.error(f"deposits failed for match {match_id}")


async def settle_wager_on_chain(match_id: str, numeric_match_id: int, winner_address: str) -> str | None:
    addr = _wager_addr()
    if not addr or not winner_address:
        return None
    result = await call_contract("settleWager", addr, str(numeric_match_id), winner_address)
    if result and result.get("ok"):
        logger.info(f"settleWager succeeded: match={match_id}, tx={result.get('tx')}")
        return result.get("tx")
    return None
