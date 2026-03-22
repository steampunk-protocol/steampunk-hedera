'use client'

import { useParams } from 'next/navigation'
import { useRaceWebSocket } from '@/hooks/useRaceWebSocket'
import { useHCSFeed } from '@/hooks/useHCSFeed'
import { TrackMinimap } from '@/components/race/TrackMinimap'
import { AgentPanel } from '@/components/race/AgentPanel'
import { BettingPanel } from '@/components/betting/BettingPanel'
import { RaceTimer } from '@/components/race/RaceTimer'
import { FightViewer } from '@/components/fight/FightViewer'
import { COLORS, FONTS, MATCH_LABELS } from '@/config/theme'

export default function MatchPage() {
  const params = useParams()
  const matchId = params.matchId as string
  const { raceState, bettingState, reasoningMap, connected } = useRaceWebSocket(matchId)

  const hcsTopicId = raceState?.hcs_match_topic_id ?? ''
  const { messages: hcsMessages, loading: hcsLoading } = useHCSFeed(hcsTopicId)

  const status = raceState?.race_status ?? 'waiting'
  const players = raceState?.players ?? []

  // Detect game type: show FightViewer if frame_b64 exists or health values are in 0-176 range
  const isFighting = !!raceState?.frame_b64 || (
    players.length >= 2 &&
    players[0]?.x >= 0 && players[0]?.x <= 176 &&
    players[0]?.y >= 0 && players[0]?.y <= 176
  )

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
          <h1 style={{ color: COLORS.primary, fontSize: '1rem', margin: 0, fontFamily: FONTS.heading }}>
            {status === 'waiting' && MATCH_LABELS.waiting}
            {status === 'in_progress' && MATCH_LABELS.in_progress}
            {status === 'finished' && MATCH_LABELS.finished}
          </h1>
          {raceState?.track_name && (
            <div style={{ fontSize: '12px', color: COLORS.textDim, marginTop: '2px' }}>
              {raceState.track_name}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <RaceTimer raceStatus={status} />
          <span style={{
            color: connected ? COLORS.green : COLORS.red,
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
          background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
          border: `1px solid ${COLORS.primary}`,
          borderRadius: '8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '9px', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: '3px', fontFamily: FONTS.heading }}>
            Winner
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: COLORS.text, marginTop: '4px' }}>
            {winner.model_name}
          </div>
          {raceState?.finish_times_ms && winnerId && raceState.finish_times_ms[winnerId] && (
            <div style={{ fontSize: '13px', color: COLORS.textMuted, marginTop: '4px' }}>
              {(raceState.finish_times_ms[winnerId] / 1000).toFixed(1)}s
            </div>
          )}
          {raceState?.match_result_hash && (
            <div style={{ fontSize: '11px', color: COLORS.textDim, marginTop: '8px', fontFamily: FONTS.mono }}>
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
          color: COLORS.textDim,
          fontSize: '14px',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '12px', color: COLORS.primary }}>
            &#x2699;
          </div>
          Waiting for agents to join match #{matchId}...
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
        {/* Left column: viewer + competitors + HCS feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Detect game type: show FightViewer if frame exists or health in 0-176 range */}
          {isFighting && players.length >= 2 ? (
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

          {/* Competitors */}
          <div className="panel" style={{ background: COLORS.bgSurface }}>
            <div className="label" style={{ marginBottom: '12px' }}>
              COMPETITORS
            </div>
            {players.length === 0 ? (
              <p style={{ color: COLORS.textDim, fontSize: '13px' }}>No agents yet</p>
            ) : isFighting ? (
              players.map((player, i) => {
                const hp = Math.max(0, player.x)
                const roundsWon = player.position - 1
                const color = COLORS.agents[i] ?? COLORS.agents[0]
                return (
                  <div key={player.agent_id} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr auto',
                    gap: '12px', alignItems: 'center',
                    padding: '12px 0', borderBottom: `1px solid ${COLORS.borderSubtle}`,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: color, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 'bold', fontSize: '11px',
                      fontFamily: FONTS.heading,
                    }}>P{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', color: COLORS.text }}>
                        {player.model_name || player.agent_id.slice(0, 10)}
                      </div>
                      <div style={{ fontSize: '11px', color: COLORS.textDim }}>
                        {player.agent_id.slice(0, 8)}…
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color }}>
                        HP {Math.round(hp)}/176
                      </div>
                      <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
                        Rounds: {roundsWon}/2
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

          {/* HCS Feed */}
          <div className="panel" style={{ background: COLORS.bgSurface }}>
            <div className="label" style={{ marginBottom: '12px' }}>
              HCS Feed
              {hcsTopicId && (
                <span style={{ fontSize: '10px', color: COLORS.textDim, marginLeft: '8px', fontWeight: 'normal' }}>
                  {hcsTopicId}
                </span>
              )}
            </div>
            {!hcsTopicId ? (
              <p style={{ color: COLORS.textMuted, fontSize: '12px' }}>
                HCS topic will appear when the match starts
              </p>
            ) : hcsLoading ? (
              <p style={{ color: COLORS.textMuted, fontSize: '12px' }}>Loading messages...</p>
            ) : hcsMessages.length === 0 ? (
              <p style={{ color: COLORS.textMuted, fontSize: '12px' }}>No messages yet</p>
            ) : (
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {hcsMessages.map((msg) => {
                  const msgType = (msg.parsed?.type as string) ?? 'unknown'
                  return (
                    <div
                      key={msg.sequence_number}
                      style={{
                        padding: '6px 0',
                        borderBottom: `1px solid ${COLORS.borderSubtle}`,
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: COLORS.primary, fontWeight: 'bold' }}>
                          #{msg.sequence_number}
                        </span>
                        <span style={{ color: COLORS.textDim }}>
                          {msgType}
                        </span>
                      </div>
                      <div style={{
                        color: COLORS.textMuted,
                        marginTop: '2px',
                        fontFamily: FONTS.mono,
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
