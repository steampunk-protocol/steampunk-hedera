"""
On-chain lifecycle helpers for PredictionPool and Wager contracts.

PredictionPool phases:
  1. createPool(matchId, agents)  — when match is created (queue.py)
  2. lockPool(matchId)            — when match starts (race_runner.py)
  3. settlePool(matchId, winner)  — when match settles (race_runner.py)

Wager phases:
  1. createWager(matchId, agents, amount) — when match is created (queue.py)
  2. settleWager(matchId, winner)         — when match settles (race_runner.py)

All calls are non-blocking (run via asyncio.to_thread) and wrapped in try/except
so failures never crash the match lifecycle.
"""
from __future__ import annotations
import asyncio
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_RPC_URL = "https://testnet.hashio.io/api"
# Hedera JSON-RPC relay needs explicit gas price (gas estimation often fails)
HEDERA_GAS_PRICE = 1_500_000_000_000  # 1500 gwei


def _tx_params(w3, arena_account, gas: int = 300000) -> dict:
    """Standard tx params for Hedera JSON-RPC relay."""
    return {
        "from": arena_account.address,
        "nonce": w3.eth.get_transaction_count(arena_account.address),
        "gas": gas,
        "gasPrice": HEDERA_GAS_PRICE,
    }


def _load_pool_contract(rpc_url: str, pool_address: str):
    """Return (web3_instance, contract) for PredictionPool."""
    from web3 import Web3
    import json as _json

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    abis_dir = Path(__file__).parent.parent / "contracts" / "abis"
    with open(abis_dir / "PredictionPool.json") as f:
        abi_data = _json.load(f)
    pool_abi = abi_data.get("abi", abi_data)
    pool = w3.eth.contract(
        address=Web3.to_checksum_address(pool_address),
        abi=pool_abi,
    )
    return w3, pool


def _get_arena_account():
    """Load arena signing account from env."""
    from eth_account import Account

    arena_key = os.environ.get("ARENA_PRIVATE_KEY", "") or os.environ.get("ORACLE_PRIVATE_KEY", "") or os.environ.get("DEPLOYER_KEY", "")
    if not arena_key:
        return None
    return Account.from_key(arena_key if arena_key.startswith("0x") else "0x" + arena_key)


def _create_pool_sync(rpc_url: str, pool_address: str, numeric_match_id: int, agents: list[str], arena_account):
    """Blocking: call PredictionPool.createPool(matchId, agents)."""
    from web3 import Web3

    w3, pool = _load_pool_contract(rpc_url, pool_address)
    agent_addrs = [Web3.to_checksum_address(a) for a in agents if a != "0x" + "0" * 40]

    nonce = w3.eth.get_transaction_count(arena_account.address)
    tx = pool.functions.createPool(numeric_match_id, agent_addrs).build_transaction(_tx_params(w3, arena_account, 300000))
    signed_tx = arena_account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt.status == 1:
        logger.info(f"PredictionPool.createPool() succeeded: matchId={numeric_match_id}")
    else:
        logger.error(f"PredictionPool.createPool() reverted: {tx_hash.hex()}")


def _lock_pool_sync(rpc_url: str, pool_address: str, numeric_match_id: int, arena_account):
    """Blocking: call PredictionPool.lockPool(matchId)."""
    w3, pool = _load_pool_contract(rpc_url, pool_address)

    nonce = w3.eth.get_transaction_count(arena_account.address)
    tx = pool.functions.lockPool(numeric_match_id).build_transaction(_tx_params(w3, arena_account, 200000))
    signed_tx = arena_account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt.status == 1:
        logger.info(f"PredictionPool.lockPool() succeeded: matchId={numeric_match_id}")
    else:
        logger.error(f"PredictionPool.lockPool() reverted: {tx_hash.hex()}")


def _settle_pool_sync(rpc_url: str, pool_address: str, numeric_match_id: int, winner_address: str, arena_account):
    """Blocking: call PredictionPool.settlePool(matchId, winner)."""
    from web3 import Web3

    w3, pool = _load_pool_contract(rpc_url, pool_address)

    tx = pool.functions.settlePool(
        numeric_match_id,
        Web3.to_checksum_address(winner_address),
    ).build_transaction(_tx_params(w3, arena_account, 200000))
    signed_tx = arena_account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt.status == 1:
        logger.info(f"PredictionPool.settlePool() succeeded: matchId={numeric_match_id}")
    else:
        logger.error(f"PredictionPool.settlePool() reverted: {tx_hash.hex()}")


async def create_pool_on_chain(match_id: str, agents: list[str]) -> None:
    """Async wrapper: create a prediction pool when a match is created."""
    pool_address = os.environ.get("PREDICTION_POOL_ADDRESS", "")
    rpc_url = os.environ.get("RPC_URL", DEFAULT_RPC_URL)
    arena_account = _get_arena_account()

    if not (pool_address and arena_account and rpc_url):
        logger.warning("PredictionPool env not configured — skipping createPool")
        return

    from arena.utils import match_id_to_uint256
    numeric_match_id = match_id_to_uint256(match_id)

    try:
        await asyncio.to_thread(
            _create_pool_sync, rpc_url, pool_address, numeric_match_id, agents, arena_account,
        )
    except Exception as e:
        logger.error(f"PredictionPool.createPool failed for match {match_id}: {e}")


async def lock_pool_on_chain(match_id: str) -> None:
    """Async wrapper: lock a prediction pool when a match starts."""
    pool_address = os.environ.get("PREDICTION_POOL_ADDRESS", "")
    rpc_url = os.environ.get("RPC_URL", DEFAULT_RPC_URL)
    arena_account = _get_arena_account()

    if not (pool_address and arena_account and rpc_url):
        logger.warning("PredictionPool env not configured — skipping lockPool")
        return

    from arena.utils import match_id_to_uint256
    numeric_match_id = match_id_to_uint256(match_id)

    try:
        await asyncio.to_thread(
            _lock_pool_sync, rpc_url, pool_address, numeric_match_id, arena_account,
        )
    except Exception as e:
        logger.error(f"PredictionPool.lockPool failed for match {match_id}: {e}")


async def settle_pool_on_chain(match_id: str, numeric_match_id: int, winner_address: str) -> None:
    """Async wrapper: settle a prediction pool when a match ends."""
    pool_address = os.environ.get("PREDICTION_POOL_ADDRESS", "")
    rpc_url = os.environ.get("RPC_URL", DEFAULT_RPC_URL)
    arena_account = _get_arena_account()

    if not (pool_address and arena_account and rpc_url and winner_address):
        logger.warning("PredictionPool env not configured or no winner — skipping settlePool")
        return

    try:
        await asyncio.to_thread(
            _settle_pool_sync, rpc_url, pool_address, numeric_match_id, winner_address, arena_account,
        )
    except Exception as e:
        logger.error(f"PredictionPool.settlePool failed for match {match_id}: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# Wager lifecycle
# ──────────────────────────────────────────────────────────────────────────────

def _load_wager_contract(rpc_url: str, wager_address: str):
    """Return (web3_instance, contract) for WagerV2."""
    from web3 import Web3
    import json as _json

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    abis_dir = Path(__file__).parent.parent / "contracts" / "abis"
    with open(abis_dir / "Wager.json") as f:
        abi_data = _json.load(f)
    wager_abi = abi_data.get("abi", abi_data)
    wager = w3.eth.contract(
        address=Web3.to_checksum_address(wager_address),
        abi=wager_abi,
    )
    return w3, wager


def _create_wager_sync(rpc_url: str, wager_address: str, numeric_match_id: int,
                       agents: list[str], wager_amount_raw: int, arena_account):
    """Blocking: createMatch + approve STEAM + depositFor each agent."""
    from web3 import Web3
    import json as _json

    w3, wager = _load_wager_contract(rpc_url, wager_address)
    agent_addrs = [Web3.to_checksum_address(a) for a in agents if a != "0x" + "0" * 40]

    # 1. Create the wager match
    nonce = w3.eth.get_transaction_count(arena_account.address)
    tx = wager.functions.createMatch(
        numeric_match_id, agent_addrs, wager_amount_raw
    ).build_transaction(_tx_params(w3, arena_account, 400000))
    signed_tx = arena_account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt.status != 1:
        logger.error(f"Wager.createMatch() reverted: {tx_hash.hex()}")
        return
    logger.info(f"Wager.createMatch() succeeded: matchId={numeric_match_id}, amount={wager_amount_raw}")

    # 2. depositFor each agent (arena deposits on their behalf)
    # STEAM allowance is pre-approved via HTS AccountAllowanceApproveTransaction
    for agent_addr in agent_addrs:
        nonce = w3.eth.get_transaction_count(arena_account.address)
        dep_tx = wager.functions.depositFor(
            numeric_match_id, agent_addr
        ).build_transaction(_tx_params(w3, arena_account, 300000))
        signed = arena_account.sign_transaction(dep_tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        if receipt.status == 1:
            logger.info(f"Wager.depositFor({agent_addr}) succeeded")
        else:
            logger.error(f"Wager.depositFor({agent_addr}) reverted: {tx_hash.hex()}")


def _settle_wager_sync(rpc_url: str, wager_address: str, numeric_match_id: int,
                       winner_address: str, arena_account):
    """Blocking: call WagerV2.settle(matchId, winner)."""
    from web3 import Web3

    w3, wager = _load_wager_contract(rpc_url, wager_address)

    tx = wager.functions.settle(
        numeric_match_id,
        Web3.to_checksum_address(winner_address),
    ).build_transaction(_tx_params(w3, arena_account, 300000))
    signed_tx = arena_account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt.status == 1:
        logger.info(f"Wager.settle() succeeded: matchId={numeric_match_id}, winner={winner_address}")
        return tx_hash.hex()
    else:
        logger.error(f"Wager.settle() reverted: {tx_hash.hex()}")
        return None


async def create_wager_on_chain(match_id: str, agents: list[str], wager_amount_raw: int) -> None:
    """Async wrapper: create a wager match when agents are paired."""
    wager_address = os.environ.get("WAGER_ADDRESS", "")
    rpc_url = os.environ.get("RPC_URL", DEFAULT_RPC_URL)
    arena_account = _get_arena_account()

    if not (wager_address and arena_account and rpc_url):
        logger.warning("Wager env not configured — skipping createWager")
        return
    if wager_amount_raw <= 0:
        logger.info("Wager amount is 0 — skipping createWager")
        return

    from arena.utils import match_id_to_uint256
    numeric_match_id = match_id_to_uint256(match_id)

    try:
        await asyncio.to_thread(
            _create_wager_sync, rpc_url, wager_address, numeric_match_id, agents, wager_amount_raw, arena_account,
        )
    except Exception as e:
        logger.error(f"Wager.createMatch failed for match {match_id}: {e}")


async def settle_wager_on_chain(match_id: str, numeric_match_id: int, winner_address: str) -> str | None:
    """Async wrapper: settle wager when match ends. Returns tx hash or None."""
    wager_address = os.environ.get("WAGER_ADDRESS", "")
    rpc_url = os.environ.get("RPC_URL", DEFAULT_RPC_URL)
    arena_account = _get_arena_account()

    if not (wager_address and arena_account and rpc_url and winner_address):
        logger.warning("Wager env not configured or no winner — skipping settleWager")
        return None

    try:
        return await asyncio.to_thread(
            _settle_wager_sync, rpc_url, wager_address, numeric_match_id, winner_address, arena_account,
        )
    except Exception as e:
        logger.error(f"Wager.settle failed for match {match_id}: {e}")
        return None
