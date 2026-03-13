"""
EIP-712 MarioKartResult encoding and signing.
Single source of truth for EIP-712 logic — never duplicate in agents or frontend.

IMPORTANT: Fixed arrays in EIP-712 are encoded as keccak256(abi.encode(array))
per EIP-712 spec. eth_account.sign_typed_data handles this correctly.
The Solidity contract's _hashResult() uses the same approach.

Hedera port: CHAIN_ID defaults to 296 (Hedera testnet).
"""
from __future__ import annotations
import logging
import os
from eth_account import Account
from eth_account.signers.local import LocalAccount

logger = logging.getLogger(__name__)

# Default chain: Hedera Testnet (296). Override via CHAIN_ID env var.
DEFAULT_CHAIN_ID = int(os.environ.get("CHAIN_ID", 296))

# EIP-712 domain — must match MatchProof.sol constructor
DOMAIN = {
    "name": "SteamPunk",
    "version": "1",
    "chainId": DEFAULT_CHAIN_ID,
    "verifyingContract": "",  # set at runtime from env/config
}

# EIP-712 types — must match RESULT_TYPEHASH in MatchProof.sol exactly
MARIO_KART_RESULT_TYPES = {
    "MarioKartResult": [
        {"name": "agents", "type": "address[4]"},
        {"name": "finalPositions", "type": "uint8[4]"},
        {"name": "finishTimes", "type": "uint32[4]"},
        {"name": "trackId", "type": "uint8"},
        {"name": "matchId", "type": "uint256"},
        {"name": "timestamp", "type": "uint256"},
    ]
}


def get_domain(contract_address: str, chain_id: int = DEFAULT_CHAIN_ID) -> dict:
    """Build EIP-712 domain with the deployed contract address."""
    return {
        "name": "SteamPunk",
        "version": "1",
        "chainId": chain_id,
        "verifyingContract": contract_address,
    }


def sign_result(
    account: LocalAccount,
    result: dict,
    contract_address: str,
    chain_id: int = DEFAULT_CHAIN_ID,
) -> bytes:
    """
    Sign a MarioKartResult struct with EIP-712 typed data.

    Args:
        account: Signer's LocalAccount (arena or agent key).
        result: MarioKartResult dict with all required fields.
        contract_address: Deployed MatchProof contract address.
        chain_id: Target chain ID. Defaults to CHAIN_ID env var (Hedera testnet: 296).

    Returns:
        65-byte signature bytes.
    """
    domain = get_domain(contract_address, chain_id)
    signed = account.sign_typed_data(
        domain_data=domain,
        message_types=MARIO_KART_RESULT_TYPES,
        message_data=result,
    )
    return signed.signature


def encode_result_for_submission(result: dict) -> dict:
    """
    Normalize a result dict for on-chain submission.
    Ensures arrays are exactly length 4, padded with zeros.

    Args:
        result: Raw result dict from GameAdapter.get_race_result().

    Returns:
        Normalized dict ready for MatchProof.submitResult().
    """
    def pad4(lst, default):
        lst = list(lst)
        return (lst + [default] * 4)[:4]

    return {
        "agents": pad4(result.get("agents", []), "0x" + "0" * 40),
        "finalPositions": pad4(result.get("finalPositions", []), 0),
        "finishTimes": pad4(result.get("finishTimes", []), 0),
        "trackId": result.get("trackId", 0),
        "matchId": result.get("matchId", 0),
        "timestamp": result.get("timestamp", 0),
    }
