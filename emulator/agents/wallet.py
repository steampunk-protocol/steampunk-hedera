"""
AgentWallet — signs EIP-712 typed data using the agent's private key.

Used by agents to co-sign match results before on-chain submission.
Private key loaded from AGENT_PRIVATE_KEY env var only.

Hedera adaptation: chain ID defaults to Hedera testnet (296).
Domain name uses "AgentColosseum" (Hedera project name).
Hedera smart contracts are EVM-compatible via JSON-RPC Relay,
so EIP-712 signing works identically.
"""

from __future__ import annotations
import os
import logging
from eth_account import Account
from eth_account.signers.local import LocalAccount

logger = logging.getLogger(__name__)

# Hedera testnet chain ID. Override via CHAIN_ID env var.
DEFAULT_CHAIN_ID = int(os.environ.get("CHAIN_ID", 296))


class AgentWallet:
    """
    Signs EIP-712 structured data for match result attestation.

    Usage:
        wallet = AgentWallet()
        sig = wallet.sign_result(domain, types, result_struct)
    """

    def __init__(self, env_var: str = "AGENT_PRIVATE_KEY"):
        raw = os.environ.get(env_var, "")
        if not raw:
            raise ValueError(
                f"{env_var} not set. Agent cannot sign results without a private key."
            )
        if not raw.startswith("0x"):
            raw = "0x" + raw

        self._account: LocalAccount = Account.from_key(raw)
        # Log only address, never the key
        logger.info(f"AgentWallet initialized. Address: {self._account.address}")

    @property
    def address(self) -> str:
        """Public address of this agent's wallet."""
        return self._account.address

    def sign_typed_data(
        self,
        domain: dict,
        types: dict,
        message: dict,
    ) -> bytes:
        """
        Sign EIP-712 typed data.

        Args:
            domain: EIP-712 domain dict (name, version, chainId, verifyingContract).
            types: EIP-712 types dict (primary type name -> field list).
            message: The structured data to sign.

        Returns:
            65-byte signature (r + s + v).
        """
        signed = self._account.sign_typed_data(
            domain_data=domain,
            message_types=types,
            message_data=message,
        )
        return signed.signature

    def sign_match_result(self, result: dict, contract_address: str, chain_id: int = DEFAULT_CHAIN_ID) -> bytes:
        """
        Sign a MarioKartResult struct using the canonical EIP-712 domain.

        Args:
            result: MarioKartResult dict with all required fields.
            contract_address: Deployed MatchProof contract address.
            chain_id: Chain ID (default from CHAIN_ID env var, Hedera testnet: 296).

        Returns:
            65-byte signature.
        """
        domain = {
            "name": "AgentColosseum",
            "version": "1",
            "chainId": chain_id,
            "verifyingContract": contract_address,
        }

        types = {
            "MarioKartResult": [
                {"name": "agents", "type": "address[4]"},
                {"name": "finalPositions", "type": "uint8[4]"},
                {"name": "finishTimes", "type": "uint32[4]"},
                {"name": "trackId", "type": "uint8"},
                {"name": "matchId", "type": "uint256"},
                {"name": "timestamp", "type": "uint256"},
            ]
        }

        return self.sign_typed_data(domain, types, result)
