"""
Signature verifier — recovers signer address from EIP-712 signatures.
Used to verify agent signatures before on-chain submission.
"""
from __future__ import annotations
import logging
from eth_account import Account
from eth_account.messages import encode_typed_data

from arena.oracle.signer import get_domain, MARIO_KART_RESULT_TYPES, DEFAULT_CHAIN_ID

logger = logging.getLogger(__name__)


def recover_signer(
    signature: bytes,
    result: dict,
    contract_address: str,
    chain_id: int = DEFAULT_CHAIN_ID,
) -> str:
    """
    Recover the signer address from an EIP-712 signature over a MarioKartResult.

    Args:
        signature: 65-byte signature.
        result: MarioKartResult dict (must match what was signed).
        contract_address: Deployed MatchProof contract address.
        chain_id: Chain ID (default from CHAIN_ID env var, Hedera testnet: 296).

    Returns:
        Recovered signer address (checksum format).
    """
    domain = get_domain(contract_address, chain_id)
    structured_data = {
        "domain": domain,
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            **MARIO_KART_RESULT_TYPES,
        },
        "primaryType": "MarioKartResult",
        "message": result,
    }
    msg = encode_typed_data(full_message=structured_data)
    signer = Account.recover_message(msg, signature=signature)
    return signer


def verify_signatures(
    signatures: list[bytes],
    result: dict,
    expected_signers: list[str],
    contract_address: str,
    chain_id: int = DEFAULT_CHAIN_ID,
) -> bool:
    """
    Verify that each signature in signatures[i] was made by expected_signers[i].

    Args:
        signatures: List of 65-byte signatures (one per agent).
        result: MarioKartResult dict.
        expected_signers: List of agent addresses in slot order.
        contract_address: Deployed MatchProof contract address.
        chain_id: Chain ID (default from CHAIN_ID env var, Hedera testnet: 296).

    Returns:
        True if all signatures are valid, False otherwise.
    """
    if len(signatures) != len(expected_signers):
        logger.error(
            f"Signature count mismatch: {len(signatures)} sigs, {len(expected_signers)} expected signers"
        )
        return False

    for i, (sig, expected) in enumerate(zip(signatures, expected_signers)):
        recovered = recover_signer(sig, result, contract_address, chain_id)
        if recovered.lower() != expected.lower():
            logger.error(
                f"Signature {i} mismatch: recovered={recovered}, expected={expected}"
            )
            return False

    logger.info(f"All {len(signatures)} signatures verified")
    return True
