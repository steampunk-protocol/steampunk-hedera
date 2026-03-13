'use client'

import type { PlayerState } from '@/types/ws'

const AGENT_COLORS = ['#B8860B', '#B87333', '#4ade80', '#60a5fa']
const POSITION_LABELS = ['', '1ST', '2ND', '3RD', '4TH']

interface Props {
  player: PlayerState
  reasoning: string
  index?: number
}

export function AgentPanel({ player, reasoning, index = 0 }: Props) {
  const color = AGENT_COLORS[index % AGENT_COLORS.length]
  const posLabel = POSITION_LABELS[player.position] ?? `${player.position}TH`
  const shortId = player.agent_id.slice(0, 8) + '...'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '48px 1fr auto',
      gap: '12px',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid #2a2a2a',
    }}>
      {/* Position badge */}
      <div style={{
        width: 40, height: 40,
        borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#1a1a1a', fontWeight: 'bold', fontSize: '13px',
      }}>
        {posLabel}
      </div>

      {/* Agent info */}
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#F5F5F0' }}>
          {player.model_name}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>{shortId}</div>
        {reasoning && (
          <div style={{
            fontSize: '11px', color: color, marginTop: '4px',
            fontStyle: 'italic', maxWidth: '240px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            &quot;{reasoning}&quot;
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '11px', color: '#B8860B' }}>
          Lap {player.lap}/{player.total_laps}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>
          {player.item ?? '—'}
        </div>
        {player.gap_to_leader_ms > 0 && (
          <div style={{ fontSize: '11px', color: '#ef4444' }}>
            +{(player.gap_to_leader_ms / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  )
}
