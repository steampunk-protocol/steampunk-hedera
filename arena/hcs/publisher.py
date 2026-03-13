"""
HCS publisher — publishes match results to a Hedera HCS topic.

Uses subprocess to call arena/hcs/hcs-publisher.js (Node.js + @hashgraph/sdk).
This bridge pattern avoids pulling the full Hedera JS SDK into Python.

Environment variables required (in hcs-publisher.js process):
  HEDERA_OPERATOR_ID  — e.g. "0.0.12345"
  HEDERA_OPERATOR_KEY — DER-encoded or hex private key
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Absolute path to the JS publisher script
_PUBLISHER_JS = Path(__file__).parent / "hcs-publisher.js"


async def publish_match_result(
    topic_id: str,
    match_id: str,
    winner: str,
    proof_hash: str,
) -> int | None:
    """
    Publish a match result message to an HCS topic via hcs-publisher.js.

    Args:
        topic_id: Hedera topic ID in 0.0.XXXXX format.
        match_id: Arena match UUID.
        winner: Winner's EVM address.
        proof_hash: 0x-prefixed EIP-712 result hash (or empty string pre-submission).

    Returns:
        HCS sequence number (int) on success, None on failure.
    """
    message = {
        "type": "match_result",
        "match_id": match_id,
        "winner": winner,
        "proof_hash": proof_hash,
        "timestamp": int(time.time() * 1000),
    }
    message_json = json.dumps(message)

    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(_PUBLISHER_JS),
            topic_id,
            message_json,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ},  # pass current env so JS can read HEDERA_* vars
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)

        if proc.returncode != 0:
            logger.error(
                f"hcs-publisher.js failed for match {match_id}: "
                f"rc={proc.returncode}, stderr={stderr.decode()}"
            )
            return None

        output = stdout.decode().strip()
        # hcs-publisher.js prints: {"sequenceNumber": <N>}
        result = json.loads(output)
        seq = result.get("sequenceNumber")
        logger.info(f"HCS message published: topic={topic_id}, match={match_id}, seq={seq}")
        return seq

    except asyncio.TimeoutError:
        logger.error(f"hcs-publisher.js timed out for match {match_id}")
        return None
    except FileNotFoundError:
        logger.error("node not found — install Node.js to enable HCS publishing")
        return None
    except Exception as e:
        logger.error(f"HCS publish failed for match {match_id}: {e}")
        return None
