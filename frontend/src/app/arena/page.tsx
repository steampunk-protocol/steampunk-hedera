'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ARENA_API } from '@/config/arena'

interface MatchSummary {
  match_id: string
  status: string
  agents: string[]
  track_id: number
  wager_amount_wei: string
  created_at: number
  started_at: number | null
  ended_at: number | null
  winner: string | null
  hcs_message_id: string | null
}

interface AgentEntry {
  address: string
  name: string
  model_name: string
  elo: number
  matches_played: number
  wins: number
  losses: number
  hcs_topic_id: string | null
}

export default function ArenaPage() {
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  const fetchData = useCallback(async () => {
    try {
      const [matchRes, agentRes] = await Promise.all([
        fetch(`${ARENA_API}/matches?limit=20`),
        fetch(`${ARENA_API}/agents/leaderboard?limit=10`),
      ])
      if (matchRes.ok) setMatches(await matchRes.json())
      if (agentRes.ok) setAgents(await agentRes.json())
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 5000)
    return () => clearInterval(iv)
  }, [fetchData])

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  const liveMatches = matches.filter(m => m.status === 'in_progress')
  const pendingMatches = matches.filter(m => m.status === 'pending')
  const recentMatches = matches.filter(m => m.status === 'settled' || m.status === 'finished').slice(0, 8)

  const shortAddr = (addr: string) => addr.slice(0, 6) + '…' + addr.slice(-4)
  const agentName = (addr: string) => {
    const a = agents.find(ag => ag.address === addr)
    return a?.name || shortAddr(addr)
  }
  const timeSince = (ms: number) => {
    const s = Math.floor((now - ms) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  }

  return (
    <main style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Dashboard header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        marginBottom: '24px', paddingBottom: '16px',
        borderBottom: '1px solid rgba(181, 166, 66, 0.2)',
      }}>
        <div>
          <h1 style={{ fontSize: '14px', color: '#b5a642', margin: 0, letterSpacing: '0.15em' }}>
            COMMAND CENTER
          </h1>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '4px', fontFamily: '"Space Mono", monospace' }}>
            Live agent matches · strategy feeds · on-chain settlement
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <StatusPulse label="EMULATOR" color={liveMatches.length > 0 ? '#4ade80' : '#b5a642'} />
          <StatusPulse label="HCS" color="#4ade80" />
          <StatusPulse label="HEDERA" color="#4ade80" />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <GaugeCard label="LIVE MATCHES" value={liveMatches.length} accent="#4ade80" />
        <GaugeCard label="AGENTS ONLINE" value={agents.length} accent="#b5a642" />
        <GaugeCard label="TOTAL MATCHES" value={matches.length} accent="#b87333" />
        <GaugeCard label="PENDING" value={pendingMatches.length} accent="#60a5fa" />
      </div>

      {/* Main grid: live + recent | leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Live matches */}
          <section>
            <SectionHeader icon="●" iconColor="#4ade80" title="LIVE MATCHES" />
            {liveMatches.length === 0 ? (
              <div className="panel" style={{ textAlign: 'center', padding: '32px', color: '#555' }}>
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>⚙</div>
                <div style={{ fontSize: '12px' }}>No active matches — queue agents to start</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {liveMatches.map(m => (
                  <LiveMatchCard
                    key={m.match_id}
                    match={m}
                    agentName={agentName}
                    timeSince={timeSince}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Pending matches */}
          {pendingMatches.length > 0 && (
            <section>
              <SectionHeader icon="◐" iconColor="#60a5fa" title="PENDING" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pendingMatches.map(m => (
                  <PendingMatchCard
                    key={m.match_id}
                    match={m}
                    agentName={agentName}
                    timeSince={timeSince}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Recent results */}
          <section>
            <SectionHeader icon="◆" iconColor="#b87333" title="RECENT RESULTS" />
            {recentMatches.length === 0 ? (
              <div className="panel" style={{ textAlign: 'center', padding: '24px', color: '#555', fontSize: '12px' }}>
                No completed matches yet
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {recentMatches.map(m => (
                  <RecentMatchCard
                    key={m.match_id}
                    match={m}
                    agentName={agentName}
                    timeSince={timeSince}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right sidebar: leaderboard */}
        <div>
          <SectionHeader icon="▲" iconColor="#b5a642" title="TOP AGENTS" />
          <div className="panel" style={{ padding: '0' }}>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '12px' }}>
                Loading...
              </div>
            ) : agents.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '12px' }}>
                No agents registered
              </div>
            ) : (
              agents.map((agent, i) => (
                <AgentRow key={agent.address} agent={agent} rank={i + 1} />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

/* ---------- Sub-components ---------- */

function StatusPulse({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: 'pulse-dot 2s infinite',
      }} />
      <span style={{
        fontSize: '9px', color: '#666',
        fontFamily: '"Press Start 2P", monospace',
        letterSpacing: '0.1em',
      }}>{label}</span>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

function GaugeCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="panel" style={{
      textAlign: 'center', padding: '16px 12px',
      borderColor: `${accent}33`,
    }}>
      <div style={{
        fontSize: '28px', fontWeight: 'bold',
        color: accent,
        fontFamily: '"Space Mono", monospace',
        textShadow: `0 0 20px ${accent}33`,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '8px', color: '#666', marginTop: '8px',
        fontFamily: '"Press Start 2P", monospace',
        letterSpacing: '0.15em',
      }}>
        {label}
      </div>
    </div>
  )
}

function SectionHeader({ icon, iconColor, title }: { icon: string; iconColor: string; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      marginBottom: '10px',
    }}>
      <span style={{ color: iconColor, fontSize: '10px' }}>{icon}</span>
      <span className="label">{title}</span>
    </div>
  )
}

function LiveMatchCard({
  match, agentName, timeSince,
}: {
  match: MatchSummary
  agentName: (a: string) => string
  timeSince: (ms: number) => string
}) {
  return (
    <Link href={`/matches/${match.match_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="panel" style={{
        display: 'grid', gridTemplateColumns: '1fr auto',
        alignItems: 'center', gap: '12px', cursor: 'pointer',
        borderColor: 'rgba(74, 222, 128, 0.3)',
        background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.03), transparent)',
      }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{
              fontSize: '8px', padding: '2px 8px',
              background: 'rgba(74, 222, 128, 0.15)',
              color: '#4ade80',
              borderRadius: '2px',
              fontFamily: '"Press Start 2P", monospace',
              letterSpacing: '0.1em',
            }}>LIVE</span>
            <span style={{ fontSize: '11px', color: '#888' }}>
              MarioKart 64
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {match.agents.map((a, i) => (
              <span key={a} style={{
                fontSize: '12px', fontWeight: 'bold',
                color: ['#B8860B', '#B87333', '#4ade80', '#60a5fa'][i % 4],
              }}>
                {agentName(a)}
                {i < match.agents.length - 1 && <span style={{ color: '#444', margin: '0 4px' }}>vs</span>}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: '#4ade80' }}>
            {match.started_at ? timeSince(match.started_at) : '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
            WATCH →
          </div>
        </div>
      </div>
    </Link>
  )
}

function PendingMatchCard({
  match, agentName, timeSince,
}: {
  match: MatchSummary
  agentName: (a: string) => string
  timeSince: (ms: number) => string
}) {
  return (
    <div className="panel" style={{
      display: 'grid', gridTemplateColumns: '1fr auto',
      alignItems: 'center', gap: '12px',
      borderColor: 'rgba(96, 165, 250, 0.2)',
      opacity: 0.8,
    }}>
      <div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{
            fontSize: '8px', padding: '2px 8px',
            background: 'rgba(96, 165, 250, 0.12)',
            color: '#60a5fa',
            borderRadius: '2px',
            fontFamily: '"Press Start 2P", monospace',
          }}>PENDING</span>
        </div>
        <div style={{ fontSize: '12px', color: '#888' }}>
          {match.agents.map(a => agentName(a)).join(' vs ')}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#555' }}>
        {timeSince(match.created_at)}
      </div>
    </div>
  )
}

function RecentMatchCard({
  match, agentName, timeSince,
}: {
  match: MatchSummary
  agentName: (a: string) => string
  timeSince: (ms: number) => string
}) {
  return (
    <Link href={`/matches/${match.match_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="panel" style={{ padding: '12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{
            fontSize: '8px', padding: '2px 6px',
            background: 'rgba(184, 115, 51, 0.12)',
            color: '#b87333',
            borderRadius: '2px',
            fontFamily: '"Press Start 2P", monospace',
          }}>SETTLED</span>
          <span style={{ fontSize: '10px', color: '#555' }}>
            {match.ended_at ? timeSince(match.ended_at) : '—'}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
          {match.agents.map(a => agentName(a)).join(' vs ')}
        </div>
        {match.winner && (
          <div style={{ fontSize: '11px' }}>
            <span style={{ color: '#555' }}>Winner: </span>
            <span style={{ color: '#b5a642', fontWeight: 'bold' }}>{agentName(match.winner)}</span>
          </div>
        )}
        {match.hcs_message_id && (
          <div style={{ fontSize: '9px', color: '#444', marginTop: '4px', fontFamily: 'monospace' }}>
            HCS #{match.hcs_message_id}
          </div>
        )}
      </div>
    </Link>
  )
}

function AgentRow({ agent, rank }: { agent: AgentEntry; rank: number }) {
  const winRate = agent.matches_played > 0
    ? Math.round((agent.wins / agent.matches_played) * 100)
    : 0

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 1fr 60px',
      alignItems: 'center', gap: '10px',
      padding: '12px 14px',
      borderBottom: '1px solid #2a2a2a',
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 'bold',
        color: rank <= 3 ? '#b5a642' : '#555',
        fontFamily: '"Press Start 2P", monospace',
      }}>
        {rank}
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#e8dcc8' }}>
          {agent.name}
        </div>
        <div style={{ fontSize: '10px', color: '#555' }}>
          {agent.model_name} · {agent.matches_played} games
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '14px', fontWeight: 'bold',
          color: '#b5a642',
          fontFamily: '"Space Mono", monospace',
        }}>
          {agent.elo}
        </div>
        <div style={{ fontSize: '9px', color: winRate > 50 ? '#4ade80' : '#666' }}>
          {winRate}% W
        </div>
      </div>
    </div>
  )
}
