'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRaceWebSocket } from '@/hooks/useRaceWebSocket'
import { useHCSFeed } from '@/hooks/useHCSFeed'
import { TrackMinimap } from '@/components/race/TrackMinimap'
import { AgentPanel } from '@/components/race/AgentPanel'
import { BettingPanel } from '@/components/betting/BettingPanel'
import { RaceTimer } from '@/components/race/RaceTimer'
import { FightViewer } from '@/components/fight/FightViewer'
import { COLORS, FONTS, MATCH_LABELS } from '@/config/theme'
import { ARENA_API } from '@/config/arena'

interface MatchData {
  match_id: string
  status: string
  agents: string[]
  winner: string | null
  hcs_message_id: string | null
  created_at: number
  ended_at: number | null
}

export default function MatchPage() {
  const params = useParams()
  const matchId = params.matchId as string
  const { raceState, bettingState, reasoningMap, connected } = useRaceWebSocket(matchId)

  // Fetch match data from REST API (for past/settled matches)
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  useEffect(() => {
    fetch(`${ARENA_API}/agents/matches/${matchId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setMatchData(d))
      .catch(() => {})
  }, [matchId])

  const hcsTopicId = raceState?.hcs_match_topic_id ?? ''
  const { messages: hcsMessages, loading: hcsLoading } = useHCSFeed(hcsTopicId)

  // Use WS state if available, fall back to REST data
  const isLiveWS = !!raceState && (raceState.race_status === 'in_progress' || raceState.players.length > 0)
  const status = isLiveWS
    ? raceState!.race_status
    : (matchData?.status === 'settled' ? 'finished' : matchData?.status ?? 'waiting')
  const players = raceState?.players ?? []

  // Detect game type: FightViewer if frame exists or health in 0-176 range
  const isFighting = !!raceState?.frame_b64 || (
    players.length >= 2 &&
    players[0]?.x >= 0 && players[0]?.x <= 176 &&
    players[0]?.y >= 0 && players[0]?.y <= 176
  )

  const winnerId = raceState?.final_positions
    ? Object.entries(raceState.final_positions).find(([, pos]) => pos === 1)?.[0]
    : null
  const winner = winnerId ? players.find(p => p.agent_id === winnerId) : null

  return (
    <main style={{ padding: '16px 20px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{
            color: COLORS.primary, fontSize: '14px', margin: 0,
            fontFamily: FONTS.heading, letterSpacing: '0.1em',
          }}>
            {MATCH_LABELS[status as keyof typeof MATCH_LABELS] ?? 'MATCH'}
          </h1>
          {status === 'in_progress' && (
            <span style={{
              fontSize: '8px', padding: '3px 10px',
              background: COLORS.greenGlow, color: COLORS.green,
              borderRadius: '2px', fontFamily: FONTS.mono,
              animation: 'pulse-dot 2s infinite',
            }}>● LIVE</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <RaceTimer raceStatus={status} />
          <span style={{
            color: connected ? COLORS.green : COLORS.red,
            fontSize: '11px', fontFamily: FONTS.mono,
          }}>
            {connected ? '● Connected' : '○ Connecting...'}
          </span>
        </div>
      </div>

      {/* Winner banner */}
      {status === 'finished' && winner && (
        <div style={{
          padding: '20px', marginBottom: '16px',
          background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
          border: `1px solid ${COLORS.primary}`,
          borderRadius: '8px', textAlign: 'center',
          boxShadow: `0 0 20px ${COLORS.primaryGlow}`,
        }}>
          <div style={{
            fontSize: '10px', color: COLORS.primary,
            textTransform: 'uppercase', letterSpacing: '4px',
            fontFamily: FONTS.heading,
          }}>Winner</div>
          <div style={{
            fontSize: '22px', fontWeight: 'bold', color: COLORS.text,
            marginTop: '4px', fontFamily: FONTS.heading,
          }}>{winner.model_name}</div>
          {raceState?.match_result_hash && (
            <div style={{
              fontSize: '10px', color: COLORS.textDim, marginTop: '8px',
              fontFamily: FONTS.mono,
            }}>
              On-chain proof: {raceState.match_result_hash.slice(0, 20)}…
            </div>
          )}
        </div>
      )}

      {/* Waiting / Settled without WS */}
      {!isLiveWS && players.length === 0 && (
        <div style={{
          padding: '40px 16px', textAlign: 'center',
        }}>
          {matchData?.status === 'settled' || matchData?.status === 'finished' ? (
            /* Show settled match result */
            <div>
              <div style={{
                padding: '24px', marginBottom: '16px',
                background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
                border: `1px solid ${COLORS.primary}`,
                borderRadius: '8px',
                boxShadow: `0 0 20px ${COLORS.primaryGlow}`,
              }}>
                <div style={{
                  fontSize: '10px', color: COLORS.primary,
                  textTransform: 'uppercase', letterSpacing: '4px',
                  fontFamily: FONTS.heading, marginBottom: '8px',
                }}>Match Complete</div>
                <div style={{ fontSize: '13px', color: COLORS.textMuted, marginBottom: '12px' }}>
                  {matchData.agents.map(a => a.slice(0, 10) + '…').join(' vs ')}
                </div>
                {matchData.winner && (
                  <div>
                    <div style={{ fontSize: '10px', color: COLORS.textDim, marginBottom: '4px' }}>Winner</div>
                    <div style={{
                      fontSize: '18px', fontWeight: 'bold', color: COLORS.primary,
                      fontFamily: FONTS.heading,
                    }}>{matchData.winner.slice(0, 12)}…</div>
                  </div>
                )}
                {matchData.hcs_message_id && (
                  <div style={{
                    fontSize: '10px', color: COLORS.textDim, marginTop: '12px',
                    fontFamily: FONTS.mono,
                  }}>
                    On-chain proof: HCS #{matchData.hcs_message_id}
                  </div>
                )}
                {matchData.ended_at && (
                  <div style={{ fontSize: '10px', color: COLORS.textDim, marginTop: '4px' }}>
                    Settled: {new Date(matchData.ended_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ) : matchData?.status === 'in_progress' ? (
            <div style={{ color: COLORS.textDim, fontSize: '13px' }}>
              <div style={{
                fontSize: '32px', marginBottom: '12px', color: COLORS.green,
              }}>●</div>
              Match is in progress — connecting to live feed…
            </div>
          ) : (
            <div style={{ color: COLORS.textDim, fontSize: '13px' }}>
              <div style={{
                fontSize: '32px', marginBottom: '12px', color: COLORS.primary,
                animation: 'spin 8s linear infinite',
              }}>⚙</div>
              Waiting for agents to join…
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
      )}

      {/* Main content — full width game viewer with sidebar */}
      {players.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
          {/* Left: game viewer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Game viewer — hero element */}
            {isFighting ? (
              <FightViewer
                players={players}
                frame_b64={raceState?.frame_b64}
                tick={raceState?.tick ?? 0}
                raceStatus={status}
                reasoningMap={reasoningMap}
              />
            ) : (
              <TrackMinimap players={players} />
            )}

            {/* HCS Activity */}
            <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px' }}>
              <div className="label" style={{ marginBottom: '8px', fontSize: '8px' }}>
                ON-CHAIN ACTIVITY
              </div>
              {!hcsTopicId ? (
                <p style={{ color: COLORS.textDim, fontSize: '11px' }}>
                  HCS messages will appear when the match starts
                </p>
              ) : hcsMessages.length === 0 ? (
                <p style={{ color: COLORS.textDim, fontSize: '11px' }}>
                  {hcsLoading ? 'Loading…' : 'No messages yet'}
                </p>
              ) : (
                <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                  {hcsMessages.slice(0, 10).map((msg) => (
                    <div key={msg.sequence_number} style={{
                      padding: '4px 0', borderBottom: `1px solid ${COLORS.borderSubtle}`,
                      fontSize: '10px', display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span style={{ color: COLORS.primary }}>#{msg.sequence_number}</span>
                      <span style={{ color: COLORS.textDim }}>
                        {(msg.parsed?.type as string) ?? 'message'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar: competitors + betting */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Competitors */}
            <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px' }}>
              <div className="label" style={{ marginBottom: '8px', fontSize: '8px' }}>
                COMPETITORS
              </div>
              {isFighting ? (
                players.map((player, i) => {
                  const hp = Math.max(0, player.x)
                  const roundsWon = player.position - 1
                  const color = COLORS.agents[i] ?? COLORS.agents[0]
                  return (
                    <div key={player.agent_id} style={{
                      display: 'flex', gap: '10px', alignItems: 'center',
                      padding: '8px 0', borderBottom: `1px solid ${COLORS.borderSubtle}`,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 'bold', fontSize: '9px',
                        fontFamily: FONTS.heading,
                      }}>P{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '12px', fontWeight: 'bold', color: COLORS.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {player.model_name || player.agent_id.slice(0, 10)}
                        </div>
                        <div style={{ fontSize: '10px', color: COLORS.textDim }}>
                          HP {Math.round(hp)}/176 · Rounds {roundsWon}/2
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                players
                  .sort((a, b) => a.position - b.position)
                  .map((player, i) => (
                    <AgentPanel
                      key={player.agent_id}
                      player={player}
                      reasoning={reasoningMap[player.agent_id] ?? ''}
                      index={i}
                    />
                  ))
              )}
            </div>

            {/* Betting */}
            <BettingPanel
              matchId={matchId}
              bettingState={bettingState}
              players={players}
            />
          </div>
        </div>
      )}
    </main>
  )
}
