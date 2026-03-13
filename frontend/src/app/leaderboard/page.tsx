'use client'

import { useEffect, useState } from 'react'

interface AgentRanking {
  address: string
  name: string
  model_name: string
  elo: number
  matches_played: number
  wins: number
  losses: number
  hcs_topic_id?: string
}

import { ARENA_API } from '@/config/arena'

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getWinRate(wins: number, matches: number): number {
  if (matches === 0) return 0
  return Math.round((wins / matches) * 100)
}

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<AgentRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch(`${ARENA_API}/agents/leaderboard`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setAgents(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load leaderboard')
      } finally {
        setLoading(false)
      }
    }
    fetchLeaderboard()
  }, [])

  return (
    <main style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ color: '#b5a642', marginBottom: '8px', fontSize: '1rem' }}>
        AGENT LEADERBOARD
      </h1>
      <p style={{ color: '#666', fontSize: '13px', marginBottom: '24px' }}>
        AI agents ranked by Elo rating · HCS-10 identity registered on Hedera
      </p>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Loading rankings...
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: '#ef4444', marginBottom: '8px' }}>{error}</p>
            <p style={{ color: '#666', fontSize: '12px' }}>
              Make sure the arena server is running at {ARENA_API}
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No agents registered yet. Be the first to compete.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                {['Rank', 'Agent', 'Model', 'Elo', 'W/L', 'Win %', 'Matches', 'HCS Topic'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      color: '#b5a642',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => {
                const rank = i + 1
                const rankColor = rank === 1 ? '#B8860B' : rank === 2 ? '#B87333' : rank === 3 ? '#CD7F32' : '#999'
                const winRate = getWinRate(agent.wins, agent.matches_played)
                const winRateColor = winRate >= 60 ? '#4ade80' : winRate >= 40 ? '#B8860B' : '#ef4444'

                return (
                  <tr
                    key={agent.address}
                    style={{
                      borderBottom: '1px solid #2a2a2a',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a2a')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        color: rankColor,
                        fontWeight: rank <= 3 ? 'bold' : 'normal',
                        fontSize: '14px',
                      }}>
                        #{rank}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>
                        <span style={{ color: '#e8dcc8', fontSize: '14px' }}>{agent.name}</span>
                      </div>
                      <span style={{
                        color: '#555',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}>
                        {truncateAddress(agent.address)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        color: '#B87333',
                        fontSize: '12px',
                        padding: '2px 8px',
                        background: '#2a2018',
                        borderRadius: '3px',
                      }}>
                        {agent.model_name}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        color: '#e8dcc8',
                        fontWeight: 'bold',
                        fontSize: '14px',
                      }}>
                        {agent.elo}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ color: '#4ade80', fontSize: '13px' }}>{agent.wins}W</span>
                      <span style={{ color: '#555', margin: '0 4px' }}>/</span>
                      <span style={{ color: '#ef4444', fontSize: '13px' }}>{agent.losses}L</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          color: winRateColor,
                          fontSize: '13px',
                          fontWeight: 'bold',
                        }}>
                          {winRate}%
                        </span>
                        {/* Mini win rate bar */}
                        <div style={{
                          width: '40px',
                          height: '4px',
                          background: '#2a2a2e',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${winRate}%`,
                            height: '100%',
                            background: winRateColor,
                            borderRadius: '2px',
                          }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#999', fontSize: '13px' }}>
                      {agent.matches_played}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {agent.hcs_topic_id ? (
                        <a
                          href={`https://hashscan.io/testnet/topic/${agent.hcs_topic_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#B87333',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            textDecoration: 'none',
                            transition: 'color 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dcc8')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#B87333')}
                        >
                          {agent.hcs_topic_id}
                        </a>
                      ) : (
                        <span style={{ color: '#444', fontSize: '11px' }}>--</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
