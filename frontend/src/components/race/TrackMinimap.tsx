'use client'

import type { PlayerState } from '@/types/ws'

// Agent slot colors (steampunk palette)
const AGENT_COLORS = ['#B8860B', '#B87333', '#4ade80', '#60a5fa']

interface Props {
  players: PlayerState[]
}

// Simple 2D track representation — oval for MVP
const TRACK_WIDTH = 400
const TRACK_HEIGHT = 200
const TRACK_CENTER_X = TRACK_WIDTH / 2
const TRACK_CENTER_Y = TRACK_HEIGHT / 2
const TRACK_RX = 160
const TRACK_RY = 70

function trackPosition(lapFraction: number, agentIndex: number): { x: number; y: number } {
  // Distribute agents slightly around their lap fraction to avoid overlap
  const offset = agentIndex * 0.02
  const angle = (lapFraction + offset) * 2 * Math.PI - Math.PI / 2
  return {
    x: TRACK_CENTER_X + TRACK_RX * Math.cos(angle),
    y: TRACK_CENTER_Y + TRACK_RY * Math.sin(angle),
  }
}

export function TrackMinimap({ players }: Props) {
  return (
    <div className="panel">
      <div className="label" style={{ marginBottom: '8px' }}>Track Map</div>
      <svg
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        style={{ display: 'block', width: '100%', maxWidth: TRACK_WIDTH }}
        viewBox={`0 0 ${TRACK_WIDTH} ${TRACK_HEIGHT}`}
      >
        {/* Track outline */}
        <ellipse
          cx={TRACK_CENTER_X}
          cy={TRACK_CENTER_Y}
          rx={TRACK_RX}
          ry={TRACK_RY}
          fill="none"
          stroke="#333"
          strokeWidth={24}
        />
        <ellipse
          cx={TRACK_CENTER_X}
          cy={TRACK_CENTER_Y}
          rx={TRACK_RX}
          ry={TRACK_RY}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={20}
        />

        {/* Start/finish line */}
        <line
          x1={TRACK_CENTER_X}
          y1={TRACK_CENTER_Y - TRACK_RY - 12}
          x2={TRACK_CENTER_X}
          y2={TRACK_CENTER_Y - TRACK_RY + 12}
          stroke="#555"
          strokeWidth={2}
          strokeDasharray="4 4"
        />

        {/* Agent dots */}
        {players.map((player, i) => {
          const lapFraction = ((player.lap - 1) + 0.5) / player.total_laps
          const pos = trackPosition(lapFraction, i)
          const color = AGENT_COLORS[i % AGENT_COLORS.length]
          return (
            <g key={player.agent_id}>
              <circle cx={pos.x} cy={pos.y} r={8} fill={color} opacity={0.9} />
              <text
                x={pos.x}
                y={pos.y + 4}
                textAnchor="middle"
                fontSize={9}
                fill="#1a1a1a"
                fontWeight="bold"
              >
                {player.position}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
