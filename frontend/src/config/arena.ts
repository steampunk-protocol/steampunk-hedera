/**
 * Arena API configuration.
 * In production (Vercel), API calls go through Next.js rewrites (/api/arena/*)
 * to avoid HTTPS→HTTP mixed content issues.
 * In development, calls go directly to the local arena server.
 */

const isProd = typeof window !== 'undefined' && window.location.protocol === 'https:'

export const ARENA_API = isProd
  ? '/api/arena'
  : (process.env.NEXT_PUBLIC_ARENA_API_URL || 'http://localhost:8000')

// WebSocket can't be proxied via Next.js rewrites.
// In production, requires WSS (DNS + TLS on VPS). Falls back to polling if unavailable.
export const ARENA_WS = process.env.NEXT_PUBLIC_ARENA_WS_URL ?? 'ws://localhost:8000'

export const HCS_MATCH_RESULTS_TOPIC = process.env.NEXT_PUBLIC_HCS_MATCH_RESULTS_TOPIC || ''
