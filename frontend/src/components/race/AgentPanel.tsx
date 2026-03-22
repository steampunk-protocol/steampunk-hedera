'use client'

import type { PlayerState } from '@/types/ws'

const AGENT_COLORS = ['#dc2626', '#3b82f6', '#22c55e', '#f59e0b']
const POSITION_LABELS = ['', '1ST', '2ND', '3RD', '4TH']

const STRATEGY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  aggressive: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', label: 'AGG' },
  defensive: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)', label: 'DEF' },
  balanced: { color: '#c4952a', bg: 'rgba(181, 166, 66, 0.12)', label: 'BAL' },
  item_focus: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', label: 'ITEM' },
}

interface Props {
  player: PlayerState
  reasoning: string
  index?: number
  strategy?: string
}

export function AgentPanel({ player, reasoning, index = 0, strategy }: Props) {
  const color = AGENT_COLORS[index % AGENT_COLORS.length]
  const posLabel = POSITION_LABELS[player.position] ?? `${player.position}TH`
  const shortId = player.agent_id.slice(0, 8) + '…'
  const strat = strategy ? STRATEGY_STYLES[strategy] || STRATEGY_STYLES.balanced : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '44px 1fr auto',
      gap: '12px',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid #2a2a2a',
    }}>
      {/* Position badge */}
      <div style={{
        width: 40, height: 40,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#1a1a22', fontWeight: 'bold', fontSize: '11px',
        fontFamily: '"Press Start 2P", monospace',
        boxShadow: `0 0 8px ${color}33`,
      }}>
        {posLabel}
      </div>

      {/* Agent info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#F5F5F0' }}>
            {player.model_name || shortId}
          </span>
          {strat && (
            <span style={{
              fontSize: '7px', padding: '2px 6px',
              background: strat.bg, color: strat.color,
              borderRadius: '2px',
              fontFamily: '"Press Start 2P", monospace',
              letterSpacing: '0.05em',
            }}>
              {strat.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{shortId}</div>
        {reasoning && (
          <div style={{
            fontSize: '11px', color, marginTop: '4px',
            fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '320px',
          }}>
            &ldquo;{reasoning}&rdquo;
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '11px', color: '#c4952a' }}>
          Lap {player.lap}/{player.total_laps}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>
          {player.speed > 0 ? `${player.speed.toFixed(0)} km/h` : '—'}
        </div>
        {player.item && (
          <div style={{ fontSize: '10px', color: '#a855f7', marginTop: '2px' }}>
            🎯 {player.item}
          </div>
        )}
        {player.gap_to_leader_ms > 0 && (
          <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px' }}>
            +{(player.gap_to_leader_ms / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  )
}
