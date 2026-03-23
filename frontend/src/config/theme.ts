/**
 * Steampunk — Centralized Theme Configuration
 *
 * Change colors, fonts, and branding in ONE place.
 * All components import from here.
 */

export const BRAND = {
  name: 'STEAMPUNK',
  tagline: 'AI Agents Compete. You Watch. Hedera Settles.',
  description: 'The open arena where autonomous AI agents compete in retro games, wager tokens, and settle trustlessly on Hedera.',
} as const

export const COLORS = {
  // Backgrounds
  bg: '#0f0f13',
  bgSurface: '#1a1a22',
  bgCard: '#16161e',
  bgHover: '#1e1e28',

  // Brand (from logo — brass/gold gradient)
  primary: '#c4952a',
  primaryDark: '#8b6914',
  primaryLight: '#dbb34a',
  primaryGlow: 'rgba(196, 149, 42, 0.3)',

  // Text
  text: '#f0e6d4',
  textMuted: '#a8a89e',
  textDim: '#777770',

  // Accent
  red: '#dc2626',
  redGlow: 'rgba(220, 38, 38, 0.3)',
  blue: '#3b82f6',
  blueGlow: 'rgba(59, 130, 246, 0.3)',
  green: '#22c55e',
  greenGlow: 'rgba(34, 197, 94, 0.3)',
  purple: '#a855f7',

  // Agent colors (for P1, P2, P3, P4)
  agents: ['#dc2626', '#3b82f6', '#22c55e', '#f59e0b'] as string[],
  agentGlows: ['rgba(220,38,38,0.3)', 'rgba(59,130,246,0.3)', 'rgba(34,197,94,0.3)', 'rgba(245,158,11,0.3)'] as string[],

  // Borders
  border: 'rgba(196, 149, 42, 0.15)',
  borderHover: 'rgba(196, 149, 42, 0.3)',
  borderSubtle: '#222228',
} as const

export const FONTS = {
  heading: '"Cinzel", "Press Start 2P", serif',
  body: '"Space Mono", ui-monospace, monospace',
  mono: '"Space Mono", ui-monospace, monospace',
} as const

// Match status labels — generic (works for racing, fighting, or any game)
export const MATCH_LABELS = {
  waiting: 'WAITING',
  in_progress: 'LIVE',
  finished: 'FINISHED',
  settled: 'SETTLED',
} as const

// Status badge styles
export const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  waiting: { color: COLORS.textMuted, bg: 'rgba(136,136,128,0.1)' },
  pending: { color: COLORS.blue, bg: 'rgba(59,130,246,0.1)' },
  in_progress: { color: COLORS.green, bg: 'rgba(34,197,94,0.12)' },
  live: { color: COLORS.green, bg: 'rgba(34,197,94,0.12)' },
  finished: { color: COLORS.primary, bg: 'rgba(196,149,42,0.1)' },
  settled: { color: COLORS.primary, bg: 'rgba(196,149,42,0.1)' },
} as const

// Strategy badge styles (game-agnostic)
export const STRATEGY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  aggressive: { color: COLORS.red, bg: 'rgba(220,38,38,0.12)', label: 'AGG' },
  defensive: { color: COLORS.blue, bg: 'rgba(59,130,246,0.12)', label: 'DEF' },
  balanced: { color: COLORS.primary, bg: 'rgba(196,149,42,0.12)', label: 'BAL' },
  item_focus: { color: COLORS.purple, bg: 'rgba(168,85,247,0.12)', label: 'SPL' },
  special_focus: { color: COLORS.purple, bg: 'rgba(168,85,247,0.12)', label: 'SPL' },
} as const
