"""
Shared utilities for the arena.
"""
from web3 import Web3


def match_id_to_uint256(match_id: str) -> int:
    """
    Convert a UUID match ID string to a deterministic uint256 for on-chain use.
    Uses keccak256(abi.encodePacked(match_id)) to produce a deterministic hash.
    """
    return int.from_bytes(
        Web3.solidity_keccak(["string"], [match_id]),
        byteorder="big",
    )
