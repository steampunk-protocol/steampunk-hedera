import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import type { Chain } from 'wagmi/chains'

// Hedera Testnet chain definition
const hederaTestnet = {
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet.hashio.io/api'] } },
  blockExplorers: { default: { name: 'HashScan', url: 'https://hashscan.io/testnet' } },
} as const satisfies Chain

// Contract addresses — read from env vars (set after deployment)
export const CONTRACTS = {
  matchProof: (process.env.NEXT_PUBLIC_MATCH_PROOF_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  wager: (process.env.NEXT_PUBLIC_WAGER_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  predictionPool: (process.env.NEXT_PUBLIC_PREDICTION_POOL_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  steamToken: (process.env.NEXT_PUBLIC_STEAM_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
} as const

// PredictionPool ABI — only the functions the frontend calls
export const predictionPoolAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'matchId', type: 'uint256' },
      { internalType: 'address', name: 'agent', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'placeBet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'matchId', type: 'uint256' }],
    name: 'claimWinnings',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'matchId', type: 'uint256' }],
    name: 'getPoolTotals',
    outputs: [
      { internalType: 'address[]', name: 'agents', type: 'address[]' },
      { internalType: 'uint256[]', name: 'totals', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    name: 'pools',
    outputs: [
      { internalType: 'uint256', name: 'matchId', type: 'uint256' },
      { internalType: 'uint8', name: 'status', type: 'uint8' },
      { internalType: 'address', name: 'winner', type: 'address' },
      { internalType: 'uint256', name: 'totalPool', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// HTS-compatible ERC-20 ABI — approve + allowance + balanceOf
// HTS STEAM token uses 8 decimals (not 18)
export const erc20Abi = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const wagmiConfig = getDefaultConfig({
  appName: 'SteamPunk Arena',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'steampunk-dev',
  chains: [hederaTestnet],
})
