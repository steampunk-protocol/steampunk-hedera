'use client'

import { useParams } from 'next/navigation'
import { useRaceWebSocket } from '@/hooks/useRaceWebSocket'
import { useHCSFeed } from '@/hooks/useHCSFeed'
import { TrackMinimap } from '@/components/race/TrackMinimap'
import { AgentPanel } from '@/components/race/AgentPanel'
import { BettingPanel } from '@/components/betting/BettingPanel'
import { RaceTimer } from '@/components/race/RaceTimer'

export default function MatchPage() {
  const params = useParams()
  const matchId = params.matchId as string
  const { raceState, bettingState, reasoningMap, connected } = useRaceWebSocket(matchId)

  const hcsTopicId = raceState?.hcs_match_topic_id ?? ''
  const { messages: hcsMessages, loading: hcsLoading } = useHCSFeed(hcsTopicId)

  const status = raceState?.race_status ?? 'waiting'
  const players = raceState?.players ?? []

  // Find winner from final_positions (key with value 1)
  const winnerId = raceState?.final_positions
    ? Object.entries(raceState.final_positions).find(([, pos]) => pos === 1)?.[0]
    : null
  const winner = winnerId ? players.find(p => p.agent_id === winnerId) : null

  return (
    <main style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ color: '#b5a642', fontSize: '1rem', margin: 0 }}>
            {status === 'waiting' && 'WAITING FOR RACE'}
            {status === 'in_progress' && 'RACE LIVE'}
            {status === 'finished' && 'RACE FINISHED'}
          </h1>
          {raceState?.track_name && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              {raceState.track_name}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <RaceTimer raceStatus={status} />
          <span style={{
            color: connected ? '#4ade80' : '#ef4444',
            fontSize: '12px'
          }}>
            {connected ? '● LIVE' : '○ CONNECTING...'}
          </span>
        </div>
      </div>

      {/* Winner banner */}
      {status === 'finished' && winner && (
        <div style={{
          padding: '16px',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #2a2a1a, #1e1e22)',
          border: '1px solid #b5a642',
          borderRadius: '8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '9px', color: '#b5a642', textTransform: 'uppercase', letterSpacing: '3px', fontFamily: '"Press Start 2P", monospace' }}>
            Winner
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#e8dcc8', marginTop: '4px' }}>
            {winner.model_name}
          </div>
          {raceState?.finish_times_ms && winnerId && raceState.finish_times_ms[winnerId] && (
            <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
              {(raceState.finish_times_ms[winnerId] / 1000).toFixed(1)}s
            </div>
          )}
          {raceState?.match_result_hash && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: '8px', fontFamily: 'monospace' }}>
              Proof: {raceState.match_result_hash.slice(0, 16)}...
            </div>
          )}
        </div>
      )}

      {/* Waiting state */}
      {status === 'waiting' && players.length === 0 && (
        <div style={{
          padding: '48px 16px',
          textAlign: 'center',
          color: '#666',
          fontSize: '14px',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '12px', color: '#b5a642' }}>
            &#x2699;
          </div>
          Waiting for agents to join match #{matchId}...
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
        {/* Left column: minimap + standings + HCS feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <TrackMinimap players={players} />

          {/* Standings */}
          <div className="panel">
            <div className="label" style={{ marginBottom: '12px' }}>Standings</div>
            {players.length === 0 ? (
              <p style={{ color: '#666', fontSize: '13px' }}>No agents yet</p>
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

          {/* HCS Feed */}
          <div className="panel">
            <div className="label" style={{ marginBottom: '12px' }}>
              HCS Feed
              {hcsTopicId && (
                <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px', fontWeight: 'normal' }}>
                  {hcsTopicId}
                </span>
              )}
            </div>
            {!hcsTopicId ? (
              <p style={{ color: '#666', fontSize: '12px' }}>
                HCS topic will appear when the race starts
              </p>
            ) : hcsLoading ? (
              <p style={{ color: '#666', fontSize: '12px' }}>Loading messages...</p>
            ) : hcsMessages.length === 0 ? (
              <p style={{ color: '#666', fontSize: '12px' }}>No messages yet</p>
            ) : (
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {hcsMessages.map((msg) => {
                  const msgType = (msg.parsed?.type as string) ?? 'unknown'
                  return (
                    <div
                      key={msg.sequence_number}
                      style={{
                        padding: '6px 0',
                        borderBottom: '1px solid #2a2a2a',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#b5a642', fontWeight: 'bold' }}>
                          #{msg.sequence_number}
                        </span>
                        <span style={{ color: '#555' }}>
                          {msgType}
                        </span>
                      </div>
                      <div style={{
                        color: '#888',
                        marginTop: '2px',
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {msg.raw_message.slice(0, 120)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: betting */}
        <BettingPanel
          matchId={matchId}
          bettingState={bettingState}
          players={players}
        />
      </div>
    </main>
  )
}
