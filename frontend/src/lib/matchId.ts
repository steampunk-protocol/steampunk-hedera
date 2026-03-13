import { keccak256, encodePacked } from 'viem'

/**
 * Convert a UUID match ID string to a deterministic uint256 for on-chain use.
 * Must match arena/utils.py match_id_to_uint256() exactly:
 *   keccak256(abi.encodePacked(match_id))
 */
export function matchIdToUint256(matchId: string): bigint {
  return BigInt(keccak256(encodePacked(['string'], [matchId])))
}
