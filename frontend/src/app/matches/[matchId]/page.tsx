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
import { ARENA_API, HCS_MATCH_RESULTS_TOPIC } from '@/config/arena'

const MIRROR_NODE = 'https://testnet.mirrornode.hedera.com/api/v1'
const PREDICTION_POOL = process.env.NEXT_PUBLIC_PREDICTION_POOL_ADDRESS || '0xbf5071FcD7d9fECc5522298865070B4508BB23cC'

interface PoolTx {
  hash: string
  from: string
  timestamp: string
}

interface AgentDetail {
  address: string
  name: string
}

interface MatchData {
  match_id: string
  status: string
  agents: string[]
  agent_details?: AgentDetail[]
  winner: string | null
  winner_name: string | null
  hcs_message_id: string | null
  on_chain_tx: string | null
  match_result_hash: string | null
  betting_window_s: number | null
  betting_ends_at: number | null
  created_at: number
  ended_at: number | null
}

export default function MatchPage() {
  const params = useParams()
  const matchId = params.matchId as string
  const { raceState, bettingState, reasoningMap, connected } = useRaceWebSocket(matchId)

  // Fetch match data from REST API — poll if in_progress and no WS
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  useEffect(() => {
    const fetchMatch = () => {
      fetch(`${ARENA_API}/agents/matches/${matchId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setMatchData(d))
        .catch(() => {})
    }
    fetchMatch()
    // Poll every 5s if match is active and WS is not connected
    const interval = setInterval(() => {
      if (!connected && matchData?.status !== 'settled' && matchData?.status !== 'finished') {
        fetchMatch()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [matchId, connected, matchData?.status])

  // Fetch PredictionPool transactions from mirror node
  const [poolTxs, setPoolTxs] = useState<PoolTx[]>([])
  useEffect(() => {
    if (!matchData || matchData.status !== 'settled') return
    fetch(`${MIRROR_NODE}/contracts/${PREDICTION_POOL}/results?limit=25&order=desc`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.results) return
        // Filter: only placeBet txs (selector 0x5b7b5f9d) in match timeframe
        const start = (matchData.created_at / 1000) - 60
        const end = ((matchData.ended_at ?? matchData.created_at) / 1000) + 120
        const filtered = data.results
          .filter((r: any) => {
            const ts = parseFloat(r.timestamp || '0')
            if (ts < start || ts > end) return false
            // Only placeBet (0x51317b4e), not createPool/lockPool/settlePool
            const func = r.function_parameters || ''
            return func.startsWith('0x51317b4e')
            return true
          })
          .map((r: any) => ({
            hash: r.hash ?? '',
            from: r.from ?? '',
            timestamp: r.timestamp ?? '',
          }))
        setPoolTxs(filtered)
      })
      .catch(() => {})
  }, [matchData])

  // Countdown for betting window
  const [countdown, setCountdown] = useState<number | null>(null)
  useEffect(() => {
    if (!matchData?.betting_ends_at || matchData.status !== 'pending') {
      setCountdown(null)
      return
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((matchData.betting_ends_at! - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        // Re-fetch match data to get new status
        fetch(`${ARENA_API}/agents/matches/${matchId}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => d && setMatchData(d))
          .catch(() => {})
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [matchData?.betting_ends_at, matchData?.status, matchId])

  const hcsTopicId = raceState?.hcs_match_topic_id || HCS_MATCH_RESULTS_TOPIC
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
    <main className="animate-fadeIn" style={{ padding: '16px 20px', maxWidth: '1300px', margin: '0 auto' }}>
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
        <div className="animate-scaleIn" style={{
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
            <div
              style={{
                fontSize: '10px', color: COLORS.textMuted, marginTop: '8px',
                fontFamily: FONTS.mono,
              }}
            >
              Result hash: {raceState.match_result_hash.slice(0, 20)}…
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
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{
                padding: '24px', marginBottom: '16px',
                background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
                border: `1px solid ${COLORS.primary}`,
                borderRadius: '8px',
                boxShadow: `0 0 20px ${COLORS.primaryGlow}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{
                    fontSize: '10px', color: COLORS.primary,
                    textTransform: 'uppercase', letterSpacing: '4px',
                    fontFamily: FONTS.heading,
                  }}>Match Complete</span>
                  <span style={{
                    fontSize: '8px', padding: '2px 8px',
                    background: COLORS.green, color: COLORS.bg,
                    borderRadius: '2px', fontFamily: FONTS.mono, fontWeight: 'bold',
                  }}>SETTLED</span>
                </div>

                {/* Agent names + addresses */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                  {(matchData.agent_details ?? matchData.agents.map(a => ({ address: a, name: a.slice(0, 10) }))).map((agent, i) => (
                    <div key={agent.address} style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: '14px', fontWeight: 'bold',
                        color: COLORS.agents[i] ?? COLORS.text,
                        fontFamily: FONTS.heading,
                      }}>{agent.name}</div>
                      <a
                        href={`https://hashscan.io/testnet/account/${agent.address}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '9px', color: COLORS.textDim, fontFamily: FONTS.mono, textDecoration: 'none' }}
                      >{agent.address.slice(0, 10)}...{agent.address.slice(-6)}</a>
                    </div>
                  ))}
                </div>

                {matchData.winner && (
                  <div>
                    <div style={{ fontSize: '10px', color: COLORS.textDim, marginBottom: '4px' }}>Winner</div>
                    <div style={{
                      fontSize: '18px', fontWeight: 'bold', color: COLORS.primary,
                      fontFamily: FONTS.heading,
                    }}>{matchData.winner_name || matchData.winner.slice(0, 12)}</div>
                    <a
                      href={`https://hashscan.io/testnet/account/${matchData.winner}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '9px', color: COLORS.textDim, fontFamily: FONTS.mono, textDecoration: 'none' }}
                    >{matchData.winner.slice(0, 10)}...{matchData.winner.slice(-6)}</a>
                  </div>
                )}
                {matchData.ended_at && (
                  <div style={{ fontSize: '10px', color: COLORS.textDim, marginTop: '8px' }}>
                    Settled: {new Date(matchData.ended_at).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Transaction Proof for settled matches */}
              {(matchData.on_chain_tx || matchData.match_result_hash || matchData.hcs_message_id) && (
                <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px', marginBottom: '16px' }}>
                  <div className="label" style={{ marginBottom: '8px', fontSize: '8px' }}>TRANSACTION PROOF</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {matchData.on_chain_tx && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: COLORS.textDim }}>MatchProof Tx</span>
                        <a href={`https://hashscan.io/testnet/transaction/${matchData.on_chain_tx}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '10px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                        >{matchData.on_chain_tx.slice(0, 10)}...</a>
                      </div>
                    )}
                    {matchData.match_result_hash && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: COLORS.textDim }}>Result Hash</span>
                        <a href={`https://hashscan.io/testnet/contract/${process.env.NEXT_PUBLIC_MATCH_PROOF_ADDRESS || '0x08Fd822b6c5Cb32CF9229EA3D394F1dc11E2CE79'}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '10px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                        >{matchData.match_result_hash.slice(0, 14)}… ↗</a>
                      </div>
                    )}
                    {matchData.hcs_message_id && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: COLORS.textDim }}>HCS Message</span>
                        <a href={`https://hashscan.io/testnet/topic/${hcsTopicId}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '10px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                        >#{matchData.hcs_message_id}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Betting Activity */}
              {poolTxs.length > 0 && (
                <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px', marginBottom: '16px' }}>
                  <div className="label" style={{ marginBottom: '8px', fontSize: '8px' }}>BETTING ACTIVITY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {poolTxs.map((tx) => (
                      <div key={tx.hash} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px 0', borderBottom: `1px solid ${COLORS.borderSubtle}`,
                      }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '9px', color: COLORS.text, fontFamily: FONTS.mono,
                            padding: '1px 4px', background: COLORS.bgCard, borderRadius: '2px',
                          }}>BET</span>
                          <span style={{ fontSize: '9px', color: COLORS.textDim, fontFamily: FONTS.mono }}>
                            {(tx.from || '').slice(0, 10)}...{(tx.from || '').slice(-4)}
                          </span>
                        </div>
                        <a
                          href={`https://hashscan.io/testnet/transaction/${tx.hash}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '9px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                        >{tx.hash.slice(0, 10)}... ↗</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Match Settlement Summary */}
              <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px', marginBottom: '16px' }}>
                <div className="label" style={{ marginBottom: '8px', fontSize: '8px' }}>MATCH SETTLEMENT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Winner prize */}
                  <div style={{
                    padding: '10px', background: COLORS.bgCard, borderRadius: '4px',
                    border: `1px solid ${COLORS.green}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: COLORS.green, fontFamily: FONTS.mono }}>WINNER</span>
                        <div style={{ fontSize: '12px', color: COLORS.text, fontWeight: 'bold' }}>
                          {matchData.winner_name || 'Unknown'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: COLORS.green, fontFamily: FONTS.mono }}>
                          Match Prize Collected
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Betting pool info */}
                  {poolTxs.length > 0 && (
                    <div style={{ padding: '10px', background: COLORS.bgCard, borderRadius: '4px' }}>
                      <div style={{ fontSize: '10px', color: COLORS.primary, fontFamily: FONTS.mono, marginBottom: '4px' }}>
                        PREDICTION POOL
                      </div>
                      <div style={{ fontSize: '11px', color: COLORS.text }}>
                        {poolTxs.length} bets placed · Pool settled on-chain
                      </div>
                      <div style={{ fontSize: '9px', color: COLORS.textDim, marginTop: '4px' }}>
                        Winning bettors receive proportional share of the pool
                      </div>
                    </div>
                  )}

                  {/* Verification links */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {matchData.hcs_message_id && (
                      <a href={`https://hashscan.io/testnet/topic/0.0.8187173`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          fontSize: '9px', color: COLORS.primary, fontFamily: FONTS.mono,
                          textDecoration: 'none', padding: '4px 8px',
                          background: 'rgba(196,149,42,0.1)', borderRadius: '3px',
                        }}
                      >HCS Proof #{matchData.hcs_message_id} ↗</a>
                    )}
                    {matchData.on_chain_tx && (
                      <a href={`https://hashscan.io/testnet/transaction/${matchData.on_chain_tx}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          fontSize: '9px', color: COLORS.primary, fontFamily: FONTS.mono,
                          textDecoration: 'none', padding: '4px 8px',
                          background: 'rgba(196,149,42,0.1)', borderRadius: '3px',
                        }}
                      >Match Proof Tx ↗</a>
                    )}
                    <a href={`https://hashscan.io/testnet/contract/${PREDICTION_POOL}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        fontSize: '9px', color: COLORS.primary, fontFamily: FONTS.mono,
                        textDecoration: 'none', padding: '4px 8px',
                        background: 'rgba(196,149,42,0.1)', borderRadius: '3px',
                      }}
                    >PredictionPool Contract ↗</a>
                  </div>
                </div>
              </div>

              {/* HCS Activity for settled matches */}
              {hcsTopicId && (
                <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div className="label" style={{ fontSize: '8px', margin: 0 }}>ON-CHAIN ACTIVITY</div>
                    <a href={`https://hashscan.io/testnet/topic/${hcsTopicId}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '9px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                    >{hcsTopicId} ↗</a>
                  </div>
                  {hcsMessages.filter(m => m.parsed?.match_id === matchId).length === 0 ? (
                    <p style={{ color: COLORS.textDim, fontSize: '11px' }}>{hcsLoading ? 'Loading...' : 'No messages for this match'}</p>
                  ) : (
                    <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                      {hcsMessages.filter(m => m.parsed?.match_id === matchId).slice(0, 10).map((msg) => (
                        <div key={msg.sequence_number} style={{
                          padding: '4px 0', borderBottom: `1px solid ${COLORS.borderSubtle}`,
                          fontSize: '10px', display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span style={{ color: COLORS.primary, fontFamily: FONTS.mono }}>#{msg.sequence_number}</span>
                          <span style={{ color: COLORS.textDim }}>{(msg.parsed?.type as string) ?? 'message'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : matchData?.status === 'in_progress' ? (
            <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
              <div style={{
                padding: '24px', marginBottom: '16px',
                background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
                border: `1px solid ${COLORS.green}`,
                borderRadius: '8px',
                boxShadow: `0 0 20px ${COLORS.greenGlow}`,
              }}>
                <div style={{ fontSize: '10px', color: COLORS.green, textTransform: 'uppercase', letterSpacing: '4px', fontFamily: FONTS.heading, marginBottom: '8px' }}>
                  MATCH IN PROGRESS
                </div>
                {matchData.agent_details && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '12px' }}>
                    {matchData.agent_details.map((agent, i) => (
                      <div key={agent.address} style={{ fontSize: '14px', fontWeight: 'bold', color: COLORS.agents[i], fontFamily: FONTS.heading }}>
                        {agent.name}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '10px', color: COLORS.textDim, fontFamily: FONTS.mono }}>
                  {!connected ? 'Live streaming available on localhost:3060' : 'Connecting to live feed…'}
                </div>
                <div className="animate-pulseDot" style={{ fontSize: '24px', color: COLORS.green, marginTop: '8px' }}>●</div>
              </div>
            </div>
          ) : matchData?.status === 'pending' && matchData?.agent_details ? (
            /* Pending = betting window open */
            <div className="animate-fadeUp" style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{
                padding: '24px', marginBottom: '16px',
                background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
                border: `1px solid ${COLORS.green}`,
                borderRadius: '8px',
                boxShadow: `0 0 20px ${COLORS.greenGlow}`,
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '8px', color: COLORS.green,
                  textTransform: 'uppercase', letterSpacing: '4px',
                  fontFamily: FONTS.heading, marginBottom: '8px',
                }}>BETTING WINDOW OPEN</div>

                {countdown !== null && countdown > 0 ? (
                  <div style={{
                    fontSize: '28px', color: COLORS.green, fontFamily: FONTS.heading,
                    fontWeight: 'bold', marginBottom: '8px',
                    textShadow: `0 0 12px ${COLORS.greenGlow}`,
                  }}>{countdown}s</div>
                ) : (
                  <div style={{
                    fontSize: '12px', color: COLORS.primary, fontFamily: FONTS.mono,
                    marginBottom: '8px',
                  }}>Starting soon...</div>
                )}
                <div style={{
                  fontSize: '10px', color: COLORS.textMuted, marginBottom: '16px',
                  fontFamily: FONTS.mono,
                }}>
                  Place your bets before the match begins!
                </div>

                {/* Agents */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', alignItems: 'center', marginBottom: '16px' }}>
                  {matchData.agent_details.map((agent, i) => (
                    <div key={agent.address} style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: '16px', fontWeight: 'bold',
                        color: COLORS.agents[i] ?? COLORS.text,
                        fontFamily: FONTS.heading,
                      }}>{agent.name}</div>
                      <div style={{ fontSize: '9px', color: COLORS.textDim, fontFamily: FONTS.mono }}>
                        {agent.address.slice(0, 10)}...{agent.address.slice(-6)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  fontSize: '20px', color: COLORS.primary,
                  fontFamily: FONTS.heading, marginBottom: '8px',
                }}>VS</div>
              </div>

              {/* Betting Panel during pending */}
              <BettingPanel
                matchId={matchId}
                bettingState={null}
                players={matchData.agent_details.map((a, i) => ({
                  agent_id: a.address,
                  wallet_address: a.address,
                  model_name: a.name,
                  character: '',
                  position: i + 1,
                  lap: 1,
                  total_laps: 3,
                  item: null,
                  speed: 0,
                  x: 176,
                  y: 176,
                  gap_to_leader_ms: 0,
                  finished: false,
                }))}
              />
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
        <div className="animate-fadeUp" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="label" style={{ fontSize: '8px', margin: 0 }}>
                  ON-CHAIN ACTIVITY
                </div>
                {hcsTopicId && (
                  <a
                    href={`https://hashscan.io/testnet/topic/${hcsTopicId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '9px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                  >
                    {hcsTopicId} ↗
                  </a>
                )}
              </div>
              {!hcsTopicId ? (
                <p style={{ color: COLORS.textDim, fontSize: '11px' }}>
                  HCS messages will appear when the match starts
                </p>
              ) : hcsMessages.filter(m => m.parsed?.match_id === matchId).length === 0 ? (
                <p style={{ color: COLORS.textDim, fontSize: '11px' }}>
                  {hcsLoading ? 'Loading…' : 'HCS proof will appear after settlement'}
                </p>
              ) : (
                <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                  {hcsMessages
                    .filter(msg => msg.parsed?.match_id === matchId)
                    .slice(0, 10).map((msg) => {
                    const msgType = (msg.parsed?.type as string) ?? 'message'
                    const msgMatchId = msg.parsed?.match_id as string | undefined
                    const msgWinner = msg.parsed?.winner as string | undefined
                    const ts = new Date(msg.consensus_timestamp * 1000)
                    const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    return (
                      <div key={msg.sequence_number} style={{
                        padding: '5px 0', borderBottom: `1px solid ${COLORS.borderSubtle}`,
                        fontSize: '10px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ color: COLORS.primary, fontFamily: FONTS.mono }}>#{msg.sequence_number}</span>
                            <span style={{
                              color: COLORS.text, fontFamily: FONTS.mono,
                              padding: '1px 4px', background: COLORS.bgCard, borderRadius: '2px',
                            }}>{msgType}</span>
                          </div>
                          <span style={{ color: COLORS.textDim, fontFamily: FONTS.mono, fontSize: '9px' }}>{timeStr}</span>
                        </div>
                        {(msgMatchId || msgWinner) && (
                          <div style={{ marginTop: '2px', fontSize: '9px', color: COLORS.textMuted, fontFamily: FONTS.mono }}>
                            {msgMatchId && <span>match: {msgMatchId.slice(0, 8)}…</span>}
                            {msgWinner && (
                              <a href={`https://hashscan.io/testnet/account/${msgWinner}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ marginLeft: '8px', color: COLORS.green, textDecoration: 'none' }}
                              >winner: …{msgWinner.slice(-8)}</a>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Transaction Proof */}
            {(matchData?.on_chain_tx || matchData?.match_result_hash || matchData?.hcs_message_id) && (
              <div className="panel" style={{ background: COLORS.bgSurface, padding: '12px' }}>
                <div className="label" style={{ marginBottom: '8px', fontSize: '8px' }}>
                  TRANSACTION PROOF
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {matchData.on_chain_tx && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: COLORS.textDim }}>MatchProof Tx</span>
                      <a
                        href={`https://hashscan.io/testnet/transaction/${matchData.on_chain_tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: COLORS.primary, fontFamily: FONTS.mono, textDecoration: 'none' }}
                      >
                        {matchData.on_chain_tx.slice(0, 10)}…
                      </a>
                    </div>
                  )}
                  {matchData.match_result_hash && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: COLORS.textDim }}>Result Hash</span>
                      <span style={{ fontSize: '10px', color: COLORS.text, fontFamily: FONTS.mono }}>
                        {matchData.match_result_hash.slice(0, 10)}…
                      </span>
                    </div>
                  )}
                  {matchData.hcs_message_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: COLORS.textDim }}>HCS Message</span>
                      <span style={{ fontSize: '10px', color: COLORS.primary, fontFamily: FONTS.mono }}>
                        #{matchData.hcs_message_id}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
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

            {/* Betting — locked during live match, open during pending */}
            {status === 'in_progress' ? (
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
                <div className="label">Prediction Pool</div>
                <div style={{
                  padding: '12px', background: COLORS.bgCard, borderRadius: '4px',
                  border: `1px solid ${COLORS.red}`, textAlign: 'center',
                }}>
                  <div style={{ fontSize: '9px', color: COLORS.red, fontFamily: FONTS.mono, letterSpacing: '0.1em' }}>
                    BETTING CLOSED
                  </div>
                  <div style={{ fontSize: '10px', color: COLORS.textDim, marginTop: '4px' }}>
                    Pool locked — match in progress
                  </div>
                </div>
                {bettingState && (
                  <div style={{ borderTop: `1px solid ${COLORS.borderSubtle}`, paddingTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="label">Total Pool</span>
                      <span style={{ color: COLORS.primary, fontWeight: 'bold', fontSize: '12px' }}>
                        {(bettingState.total_pool_wei / 1e8).toFixed(2)} STEAM
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <BettingPanel
                matchId={matchId}
                bettingState={bettingState}
                players={players}
              />
            )}
          </div>
        </div>
      )}
    </main>
  )
}
