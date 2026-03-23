"""
Contract call helper — runs contract-caller.js via Node.js subprocess.
Uses ethers.js which handles Hedera JSON-RPC relay better than web3.py.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_SCRIPT = str(Path(__file__).parent / "contract-caller.js")


async def call_contract(action: str, *args: str) -> dict | None:
    """
    Call a contract action via Node.js subprocess.
    Returns parsed JSON result or None on failure.
    """
    env = {
        **os.environ,
        "PRIVATE_KEY": os.environ.get("ARENA_PRIVATE_KEY", "")
                       or os.environ.get("ORACLE_PRIVATE_KEY", "")
                       or os.environ.get("DEPLOYER_KEY", ""),
        "RPC_URL": os.environ.get("RPC_URL", "https://testnet.hashio.io/api"),
        "STEAM_TOKEN_EVM_ADDRESS": os.environ.get("STEAM_TOKEN_EVM_ADDRESS", "0x00000000000000000000000000000000007ced23"),
    }

    try:
        proc = await asyncio.create_subprocess_exec(
            "node", _SCRIPT, action, *[str(a) for a in args],
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

        if proc.returncode == 0 and stdout:
            result = json.loads(stdout.decode().strip())
            logger.info(f"contract-caller {action}: {result}")
            return result
        else:
            err = stderr.decode().strip() if stderr else stdout.decode().strip() if stdout else "unknown error"
            try:
                err_data = json.loads(err)
                logger.error(f"contract-caller {action} failed: {err_data.get('error', err)}")
            except json.JSONDecodeError:
                logger.error(f"contract-caller {action} failed: {err[:200]}")
            return None

    except asyncio.TimeoutError:
        logger.error(f"contract-caller {action} timed out")
        return None
    except Exception as e:
        logger.error(f"contract-caller {action} error: {e}")
        return None
