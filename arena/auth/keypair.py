"""
Agent keypair loading from environment variable.
Private key is NEVER written to disk or logged.

Single source: arena/auth/keypair.py
"""

from __future__ import annotations
import os
import logging
from eth_account import Account
from eth_account.signers.local import LocalAccount

logger = logging.getLogger(__name__)


def load_keypair(env_var: str = "AGENT_PRIVATE_KEY") -> LocalAccount:
    """
    Load agent keypair from environment variable.

    Args:
        env_var: Name of env var containing the hex private key (with or without 0x prefix).

    Returns:
        eth_account LocalAccount with address and signing capability.

    Raises:
        ValueError: If env var not set or key is invalid.
    """
    raw = os.environ.get(env_var, "")
    if not raw:
        raise ValueError(
            f"Environment variable {env_var} is not set. "
            "Generate a keypair and set this variable. "
            "NEVER store private keys in files or logs."
        )

    # Normalize hex prefix
    if not raw.startswith("0x"):
        raw = "0x" + raw

    try:
        account: LocalAccount = Account.from_key(raw)
    except Exception as e:
        raise ValueError(f"Invalid private key in {env_var}: {e}") from e

    # Log only the public address, never the key
    logger.info(f"Loaded agent keypair. Address: {account.address}")
    return account


def derive_address(env_var: str = "AGENT_PRIVATE_KEY") -> str:
    """
    Derive the public address from the private key env var.
    Convenience wrapper that returns just the address string.
    """
    return load_keypair(env_var).address
