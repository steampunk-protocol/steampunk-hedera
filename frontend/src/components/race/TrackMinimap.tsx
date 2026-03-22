'use client'

import { useMemo } from 'react'
import type { PlayerState } from '@/types/ws'

const AGENT_COLORS = ['#dc2626', '#3b82f6', '#22c55e', '#f59e0b']
const AGENT_NAMES = ['P1', 'P2', 'P3', 'P4']

const W = 520
const H = 260
const CX = W / 2
const CY = H / 2 + 10
const RX = 200
const RY = 90

interface Props {
  players: PlayerState[]
}

function trackXY(fraction: number, offset: number = 0): { x: number; y: number } {
  const angle = fraction * 2 * Math.PI - Math.PI / 2
  const r = offset // inner/outer offset
  return {
    x: CX + (RX + r) * Math.cos(angle),
    y: CY + (RY + r) * Math.sin(angle),
  }
}

export function TrackMinimap({ players }: Props) {
  const sortedPlayers = useMemo(() =>
    [...players].sort((a, b) => a.position - b.position),
    [players],
  )

  const leader = sortedPlayers[0]
  const raceActive = players.some(p => p.speed > 0)

  return (
    <div className="panel" style={{ padding: '16px 16px 12px', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div className="label">Race Map</div>
        {leader && raceActive && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <span style={{ fontSize: '10px', color: '#666' }}>
              LAP <span style={{ color: '#c4952a', fontWeight: 'bold' }}>{leader.lap}/{leader.total_laps}</span>
            </span>
            <span style={{ fontSize: '10px', color: '#666' }}>
              LEAD <span style={{ color: AGENT_COLORS[0], fontWeight: 'bold' }}>
                {leader.model_name || AGENT_NAMES[0]}
              </span>
            </span>
          </div>
        )}
      </div>

      <svg
        width={W}
        height={H}
        style={{ display: 'block', width: '100%', maxWidth: W }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* Background grid lines */}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`vg${i}`} x1={i * 40 + 20} y1={0} x2={i * 40 + 20} y2={H}
            stroke="rgba(196, 149, 42, 0.03)" strokeWidth={1} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={`hg${i}`} x1={0} y1={i * 40 + 10} x2={W} y2={i * 40 + 10}
            stroke="rgba(196, 149, 42, 0.03)" strokeWidth={1} />
        ))}

        {/* Track surface (wide road) */}
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY}
          fill="none" stroke="#333" strokeWidth={36} />
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY}
          fill="none" stroke="#262628" strokeWidth={32} />

        {/* Track center line (dashed) */}
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY}
          fill="none" stroke="rgba(196, 149, 42, 0.08)" strokeWidth={1}
          strokeDasharray="6 8" />

        {/* Track edge lines */}
        <ellipse cx={CX} cy={CY} rx={RX + 16} ry={RY + 16}
          fill="none" stroke="rgba(196, 149, 42, 0.12)" strokeWidth={1} />
        <ellipse cx={CX} cy={CY} rx={RX - 16} ry={RY - 16}
          fill="none" stroke="rgba(196, 149, 42, 0.08)" strokeWidth={1} />

        {/* Start/finish line */}
        <line
          x1={CX - 1} y1={CY - RY - 18} x2={CX - 1} y2={CY - RY + 18}
          stroke="rgba(196, 149, 42, 0.4)" strokeWidth={3} />
        <line
          x1={CX + 2} y1={CY - RY - 18} x2={CX + 2} y2={CY - RY + 18}
          stroke="rgba(196, 149, 42, 0.2)" strokeWidth={1} />

        {/* Quarter markers */}
        {[0.25, 0.5, 0.75].map(f => {
          const p = trackXY(f)
          return (
            <circle key={f} cx={p.x} cy={p.y} r={2}
              fill="rgba(196, 149, 42, 0.15)" />
          )
        })}

        {/* Speed trail effect for each agent */}
        {sortedPlayers.map((player, i) => {
          const lapFrac = ((player.lap - 1) + 0.5) / player.total_laps
          const color = AGENT_COLORS[i % AGENT_COLORS.length]

          // Draw a trail behind the agent (last ~10% of track)
          const trailPoints: string[] = []
          for (let t = 0; t < 8; t++) {
            const tf = lapFrac - t * 0.012
            const pt = trackXY(tf < 0 ? tf + 1 : tf, i * 3 - 4)
            trailPoints.push(`${pt.x},${pt.y}`)
          }

          return (
            <polyline
              key={`trail-${player.agent_id}`}
              points={trailPoints.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.25}
              style={{
                filter: `drop-shadow(0 0 3px ${color})`,
              }}
            />
          )
        })}

        {/* Agent dots + labels */}
        {sortedPlayers.map((player, i) => {
          const lapFrac = ((player.lap - 1) + 0.5) / player.total_laps
          const pos = trackXY(lapFrac, i * 3 - 4)
          const color = AGENT_COLORS[i % AGENT_COLORS.length]
          const name = player.model_name?.split('-')[0] || AGENT_NAMES[i]

          return (
            <g key={player.agent_id}>
              {/* Glow ring */}
              <circle cx={pos.x} cy={pos.y} r={14}
                fill="none" stroke={color} strokeWidth={1.5} opacity={0.3}
                style={{ filter: `drop-shadow(0 0 4px ${color})` }} />

              {/* Agent dot */}
              <circle cx={pos.x} cy={pos.y} r={9}
                fill={color} opacity={0.95}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }} />

              {/* Position number */}
              <text x={pos.x} y={pos.y + 3.5}
                textAnchor="middle" fontSize={10}
                fill="#1a1a22" fontWeight="bold"
                fontFamily="'Press Start 2P', monospace"
              >
                {player.position}
              </text>

              {/* Name label */}
              <text x={pos.x} y={pos.y - 20}
                textAnchor="middle" fontSize={8}
                fill={color} fontWeight="bold"
                fontFamily="'Space Mono', monospace"
                opacity={0.8}
              >
                {name}
              </text>
            </g>
          )
        })}

        {/* "START" label */}
        <text x={CX} y={CY - RY - 24}
          textAnchor="middle" fontSize={7}
          fill="rgba(196, 149, 42, 0.3)"
          fontFamily="'Press Start 2P', monospace"
          letterSpacing="0.15em"
        >
          START
        </text>
      </svg>

      {/* Speed bars below track */}
      {sortedPlayers.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(sortedPlayers.length, 4)}, 1fr)`,
          gap: '8px', marginTop: '10px',
        }}>
          {sortedPlayers.map((player, i) => {
            const color = AGENT_COLORS[i % AGENT_COLORS.length]
            const speedPct = Math.min(100, (player.speed / 120) * 100)
            const name = player.model_name?.split('-')[0] || AGENT_NAMES[i]
            return (
              <div key={player.agent_id}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '9px', marginBottom: '3px',
                }}>
                  <span style={{ color, fontWeight: 'bold' }}>{name}</span>
                  <span style={{ color: '#555' }}>{player.speed.toFixed(0)} km/h</span>
                </div>
                <div style={{
                  height: '3px', background: '#2a2a2a',
                  borderRadius: '2px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${speedPct}%`,
                    background: `linear-gradient(90deg, ${color}66, ${color})`,
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                    boxShadow: `0 0 4px ${color}44`,
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
