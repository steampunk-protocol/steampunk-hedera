'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ARENA_API } from '@/config/arena'
import { BRAND, COLORS, FONTS, MATCH_LABELS, STATUS_STYLES } from '@/config/theme'

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

  const router = useRouter()
  const [starting, setStarting] = useState(false)

  const startQuickMatch = async (gameType: string = 'streetfighter2') => {
    setStarting(true)
    try {
      // Default agents: HERMES and SERPENS (registered HCS-10 identities on Hedera testnet)
      const defaultAgents = [
        { address: '0x00000000000000000000000000000000007f1bce', name: 'HERMES', model: 'claude-opus' },
        { address: '0x00000000000000000000000000000000007f1bd4', name: 'SERPENS', model: 'gpt-4o' },
      ]

      // Use leaderboard agents if available, else defaults
      const agentAddrs = agents.length >= 2
        ? [agents[0].address, agents[1].address]
        : defaultAgents.map(a => a.address)

      // Register if needed
      for (let i = 0; i < agentAddrs.length; i++) {
        const addr = agentAddrs[i]
        const def = defaultAgents[i]
        await fetch(`${ARENA_API}/agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: addr,
            name: agents.find(a => a.address === addr)?.name || def?.name || `Agent-${i + 1}`,
            model_name: agents.find(a => a.address === addr)?.model_name || def?.model || 'auto',
            owner_wallet: addr,
          }),
        }).catch(() => {})
      }

      // Queue both
      await fetch(`${ARENA_API}/agents/matches/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_address: agentAddrs[0], game: gameType, wager: 0 }),
      })
      const queueRes = await fetch(`${ARENA_API}/agents/matches/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_address: agentAddrs[1], game: gameType, wager: 0 }),
      })
      const queueData = await queueRes.json()
      const matchId = queueData.match_id

      if (!matchId) {
        alert('Failed to create match')
        return
      }

      // Start match
      await fetch(`${ARENA_API}/matches/${matchId}/start?game_type=${gameType}`, {
        method: 'POST',
      })

      // Navigate to match viewer
      router.push(`/matches/${matchId}`)
    } catch (err) {
      console.error('Quick match failed:', err)
    } finally {
      setStarting(false)
    }
  }

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
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <div>
          <h1 style={{ fontSize: '14px', color: COLORS.primary, margin: 0, letterSpacing: '0.15em', fontFamily: FONTS.heading }}>
            ARENA
          </h1>
          <p style={{ fontSize: '12px', color: COLORS.textDim, marginTop: '4px', fontFamily: FONTS.body }}>
            Live AI matches &middot; real-time streaming &middot; on-chain settlement
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => startQuickMatch('streetfighter2')}
            disabled={starting}
            className="btn-brass"
            style={{
              fontSize: '11px', padding: '12px 28px',
              opacity: starting ? 0.5 : 1,
              background: COLORS.primary,
              color: COLORS.bg,
              border: 'none',
              borderRadius: '4px',
              fontFamily: FONTS.heading,
              fontWeight: 'bold',
              letterSpacing: '0.1em',
              cursor: starting ? 'not-allowed' : 'pointer',
              boxShadow: `0 0 20px ${COLORS.primaryGlow}`,
              transition: 'all 0.2s',
            }}
          >
            {starting ? 'STARTING...' : 'QUICK FIGHT'}
          </button>
          <StatusPulse label="EMULATOR" color={liveMatches.length > 0 ? COLORS.primary : COLORS.primary} />
          <StatusPulse label="HCS" color={COLORS.green} />
          <StatusPulse label="HEDERA" color={COLORS.green} />
        </div>
      </div>

      {/* Stats row */}
      <div className="animate-fadeUp delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <GaugeCard label="LIVE MATCHES" value={liveMatches.length} accent={COLORS.green} />
        <GaugeCard label="AGENTS ONLINE" value={agents.length} accent={COLORS.primary} />
        <GaugeCard label="TOTAL MATCHES" value={matches.length} accent={COLORS.agents[0]} />
        <GaugeCard label="PENDING" value={pendingMatches.length} accent={COLORS.agents[1]} />
      </div>

      {/* Main grid: live + recent | leaderboard */}
      <div className="animate-fadeUp delay-2" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Live matches */}
          <section>
            <SectionHeader icon="●" iconColor={COLORS.green} title="LIVE MATCHES" />
            {liveMatches.length === 0 ? (
              <div className="panel" style={{ textAlign: 'center', padding: '32px', color: COLORS.textDim }}>
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>&#x2699;</div>
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
              <SectionHeader icon="◐" iconColor={COLORS.blue} title="PENDING" />
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
            <SectionHeader icon="◆" iconColor={COLORS.agents[0]} title="RECENT RESULTS" />
            {recentMatches.length === 0 ? (
              <div className="panel" style={{ textAlign: 'center', padding: '24px', color: COLORS.textDim, fontSize: '12px' }}>
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
          <SectionHeader icon="▲" iconColor={COLORS.primary} title="TOP AGENTS" />
          <div className="panel" style={{ padding: '0' }}>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: COLORS.textDim, fontSize: '12px' }}>
                Loading...
              </div>
            ) : agents.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: COLORS.textDim, fontSize: '12px' }}>
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
        fontSize: '9px', color: COLORS.textDim,
        fontFamily: FONTS.mono,
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
        fontFamily: FONTS.mono,
        textShadow: `0 0 20px ${accent}33`,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '8px', color: COLORS.textDim, marginTop: '8px',
        fontFamily: FONTS.mono,
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
        borderColor: `${COLORS.green}4d`,
        background: `linear-gradient(135deg, ${COLORS.greenGlow.replace('0.3', '0.03')}, transparent)`,
      }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{
              fontSize: '8px', padding: '2px 8px',
              background: STATUS_STYLES.live.bg,
              color: STATUS_STYLES.live.color,
              borderRadius: '2px',
              fontFamily: FONTS.mono,
              letterSpacing: '0.1em',
            }}>{MATCH_LABELS.in_progress}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {match.agents.map((a, i) => (
              <span key={a} style={{
                fontSize: '12px', fontWeight: 'bold',
                color: COLORS.agents[i % COLORS.agents.length],
              }}>
                {agentName(a)}
                {i < match.agents.length - 1 && <span style={{ color: COLORS.textDim, margin: '0 4px' }}>vs</span>}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: COLORS.green }}>
            {match.started_at ? timeSince(match.started_at) : '—'}
          </div>
          <div style={{ fontSize: '10px', color: COLORS.textDim, marginTop: '2px' }}>
            WATCH &rarr;
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
      borderColor: `${COLORS.blue}33`,
      opacity: 0.8,
    }}>
      <div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{
            fontSize: '8px', padding: '2px 8px',
            background: STATUS_STYLES.pending.bg,
            color: STATUS_STYLES.pending.color,
            borderRadius: '2px',
            fontFamily: FONTS.mono,
          }}>PENDING</span>
        </div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted }}>
          {match.agents.map(a => agentName(a)).join(' vs ')}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: COLORS.textDim }}>
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
            background: STATUS_STYLES.settled.bg,
            color: STATUS_STYLES.settled.color,
            borderRadius: '2px',
            fontFamily: FONTS.mono,
          }}>SETTLED</span>
          <span style={{ fontSize: '10px', color: COLORS.textDim }}>
            {match.ended_at ? timeSince(match.ended_at) : '—'}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>
          {match.agents.map(a => agentName(a)).join(' vs ')}
        </div>
        {match.winner && (
          <div style={{ fontSize: '11px' }}>
            <span style={{ color: COLORS.textDim }}>Winner: </span>
            <span style={{ color: COLORS.primary, fontWeight: 'bold' }}>{agentName(match.winner)}</span>
          </div>
        )}
        {match.hcs_message_id && (
          <div style={{ fontSize: '9px', color: COLORS.textDim, marginTop: '4px', fontFamily: FONTS.mono }}>
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
      borderBottom: `1px solid ${COLORS.borderSubtle}`,
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 'bold',
        color: rank <= 3 ? COLORS.primary : COLORS.textDim,
        fontFamily: FONTS.mono,
      }}>
        {rank}
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: COLORS.text }}>
          {agent.name}
        </div>
        <div style={{ fontSize: '10px', color: COLORS.textDim }}>
          {agent.model_name} &middot; {agent.matches_played} games
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '14px', fontWeight: 'bold',
          color: COLORS.primary,
          fontFamily: FONTS.mono,
        }}>
          {agent.elo}
        </div>
        <div style={{ fontSize: '9px', color: winRate > 50 ? COLORS.green : COLORS.textDim }}>
          {winRate}% W
        </div>
      </div>
    </div>
  )
}
