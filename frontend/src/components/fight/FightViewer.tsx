'use client'

import type { PlayerState } from '@/types/ws'
import { COLORS, FONTS } from '@/config/theme'

const MAX_HEALTH = 176

interface Props {
  players: PlayerState[]
  frame_b64?: string | null
  tick: number
  raceStatus: string
  reasoningMap: Record<string, string>
}

export function FightViewer({ players, frame_b64, tick, raceStatus, reasoningMap }: Props) {
  const p1 = players[0]
  const p2 = players[1]

  if (!p1 && !p2) {
    return (
      <div className="panel" style={{ padding: '48px', textAlign: 'center', color: COLORS.textDim }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#x2694;</div>
        <div style={{ fontSize: '12px' }}>Waiting for competitors...</div>
      </div>
    )
  }

  // x = health, y = enemy_health, position-1 = rounds won, lap = current round
  const p1Health = p1 ? Math.max(0, p1.x) : 0
  const p2Health = p2 ? Math.max(0, p2.x) : 0
  const p1RoundsWon = p1 ? p1.position - 1 : 0
  const p2RoundsWon = p2 ? p2.position - 1 : 0
  const currentRound = p1 ? p1.lap : 1
  const p1Pct = (p1Health / MAX_HEALTH) * 100
  const p2Pct = (p2Health / MAX_HEALTH) * 100

  const p1Name = p1?.model_name || p1?.agent_id?.slice(0, 8) || 'P1'
  const p2Name = p2?.model_name || p2?.agent_id?.slice(0, 8) || 'P2'

  const isLive = raceStatus === 'in_progress'

  return (
    <div className="panel" style={{
      padding: 0, overflow: 'hidden',
      background: COLORS.bg,
      border: `1px solid ${isLive ? COLORS.primaryGlow : '#333'}`,
      boxShadow: isLive ? `0 0 12px ${COLORS.primaryGlow}` : 'none',
      transition: 'border-color 0.3s, box-shadow 0.3s',
    }}>
      {/* Top bar: health bars */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        gap: '8px', padding: '12px 16px',
        background: `linear-gradient(180deg, ${COLORS.bgSurface}, ${COLORS.bg})`,
        borderBottom: `1px solid ${COLORS.borderSubtle}`,
      }}>
        {/* P1 health */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginBottom: '4px', fontSize: '10px',
          }}>
            <span style={{
              color: COLORS.agents[0], fontWeight: 'bold',
              fontFamily: FONTS.heading,
              fontSize: '8px',
            }}>{p1Name}</span>
            <span style={{ color: COLORS.textMuted }}>{Math.round(p1Health)}</span>
          </div>
          <div style={{
            height: '16px', background: COLORS.bgCard,
            borderRadius: '2px', overflow: 'hidden',
            border: '1px solid #333',
          }}>
            <div style={{
              height: '100%',
              width: `${p1Pct}%`,
              background: p1Pct > 30
                ? `linear-gradient(180deg, ${COLORS.agents[0]}, #b91c1c)`
                : 'linear-gradient(180deg, #f97316, #c2410c)',
              borderRadius: '1px',
              transition: 'width 0.15s ease-out',
              boxShadow: p1Pct > 0 ? `0 0 8px ${p1Pct > 30 ? COLORS.agentGlows[0] : '#f9731644'}` : 'none',
            }} />
          </div>
          {/* Round wins */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < p1RoundsWon ? COLORS.agents[0] : COLORS.borderSubtle,
                border: `1px solid ${i < p1RoundsWon ? COLORS.agents[0] : '#444'}`,
                boxShadow: i < p1RoundsWon ? `0 0 4px ${COLORS.agents[0]}` : 'none',
              }} />
            ))}
          </div>
        </div>

        {/* Round indicator */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minWidth: '60px',
        }}>
          <div style={{
            fontSize: '7px', color: COLORS.primary,
            fontFamily: FONTS.heading,
            letterSpacing: '0.1em',
          }}>
            ROUND
          </div>
          <div style={{
            fontSize: '20px', fontWeight: 'bold', color: COLORS.primary,
            fontFamily: FONTS.heading,
            textShadow: `0 0 12px ${COLORS.primaryGlow}`,
          }}>
            {currentRound}
          </div>
        </div>

        {/* P2 health */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginBottom: '4px', fontSize: '10px',
          }}>
            <span style={{ color: COLORS.textMuted }}>{Math.round(p2Health)}</span>
            <span style={{
              color: COLORS.agents[1], fontWeight: 'bold',
              fontFamily: FONTS.heading,
              fontSize: '8px',
            }}>{p2Name}</span>
          </div>
          <div style={{
            height: '16px', background: COLORS.bgCard,
            borderRadius: '2px', overflow: 'hidden',
            border: '1px solid #333',
            direction: 'rtl',
          }}>
            <div style={{
              height: '100%',
              width: `${p2Pct}%`,
              background: p2Pct > 30
                ? `linear-gradient(180deg, ${COLORS.agents[1]}, #1d4ed8)`
                : 'linear-gradient(180deg, #f97316, #c2410c)',
              borderRadius: '1px',
              transition: 'width 0.15s ease-out',
              boxShadow: p2Pct > 0 ? `0 0 8px ${p2Pct > 30 ? COLORS.agentGlows[1] : '#f9731644'}` : 'none',
            }} />
          </div>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px', justifyContent: 'flex-end' }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < p2RoundsWon ? COLORS.agents[1] : COLORS.borderSubtle,
                border: `1px solid ${i < p2RoundsWon ? COLORS.agents[1] : '#444'}`,
                boxShadow: i < p2RoundsWon ? `0 0 4px ${COLORS.agents[1]}` : 'none',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Game frame */}
      <div style={{
        position: 'relative',
        background: '#000',
        minHeight: '300px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {frame_b64 ? (
          <img
            src={`data:image/jpeg;base64,${frame_b64}`}
            alt="Game Frame"
            style={{
              width: '100%', maxWidth: '640px',
              imageRendering: 'pixelated',
              border: `1px solid ${COLORS.borderSubtle}`,
            }}
          />
        ) : (
          <div style={{
            textAlign: 'center', color: '#333',
            padding: '60px 20px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#x2694;</div>
            <div style={{
              fontSize: '10px', color: COLORS.textDim,
              fontFamily: FONTS.heading,
            }}>
              {isLive ? 'MATCH IN PROGRESS' : 'WAITING FOR MATCH'}
            </div>
            <div style={{ fontSize: '11px', color: COLORS.textDim, marginTop: '8px' }}>
              Tick {tick}
            </div>
          </div>
        )}

        {/* KO overlay */}
        {(p1Health <= 0 || p2Health <= 0) && isLive && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}>
            <div style={{
              fontSize: '24px', color: COLORS.red,
              fontFamily: FONTS.heading,
              textShadow: `0 0 20px ${COLORS.redGlow}`,
              animation: 'ko-flash 0.5s ease-in-out infinite alternate',
            }}>
              K.O.
            </div>
          </div>
        )}

        {/* MATCH OVER overlay */}
        {raceStatus === 'finished' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
          }}>
            <div style={{
              fontSize: '12px', color: COLORS.primary,
              fontFamily: FONTS.heading,
              letterSpacing: '0.2em', marginBottom: '8px',
            }}>
              WINNER
            </div>
            <div style={{
              fontSize: '18px', fontWeight: 'bold',
              color: p1RoundsWon >= 2 ? COLORS.agents[0] : COLORS.agents[1],
              fontFamily: FONTS.heading,
              textShadow: `0 0 20px ${p1RoundsWon >= 2 ? COLORS.agentGlows[0] : COLORS.agentGlows[1]}`,
            }}>
              {p1RoundsWon >= 2 ? p1Name : p2Name}
            </div>
          </div>
        )}
      </div>

      {/* Agent reasoning */}
      {(reasoningMap[p1?.agent_id] || reasoningMap[p2?.agent_id]) && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '1px', background: COLORS.borderSubtle,
          borderTop: `1px solid ${COLORS.borderSubtle}`,
        }}>
          {[p1, p2].map((p, i) => {
            if (!p) return null
            const reasoning = reasoningMap[p.agent_id]
            return (
              <div key={p.agent_id} style={{
                padding: '8px 12px', background: COLORS.bg,
                fontSize: '10px', color: COLORS.textMuted,
              }}>
                <span style={{ color: COLORS.agents[i], fontWeight: 'bold' }}>
                  {i === 0 ? p1Name : p2Name}
                </span>
                {reasoning && (
                  <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>
                    &ldquo;{reasoning}&rdquo;
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CSS */}
      <style>{`
        @keyframes ko-flash {
          from { opacity: 0.5; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
