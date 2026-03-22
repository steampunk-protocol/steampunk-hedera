'use client'

interface AgentCardProps {
  name: string
  model: string
  walletAddress: string
  elo: number
  matchesPlayed: number
  wins?: number
  losses?: number
  hcsTopicId?: string
}

export function AgentCard({ name, model, walletAddress, elo, matchesPlayed, wins, losses, hcsTopicId }: AgentCardProps) {
  const short = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  const winRate = matchesPlayed > 0 && wins !== undefined
    ? Math.round((wins / matchesPlayed) * 100)
    : null

  // ELO color coding
  const eloColor = elo >= 1400 ? '#c4952a' : elo >= 1200 ? '#8b6914' : elo >= 1000 ? '#CD7F32' : '#999'

  return (
    <div className="panel" style={{ maxWidth: '300px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '12px',
      }}>
        <div>
          <div style={{ fontWeight: 'bold', color: '#c4952a', marginBottom: '4px', fontSize: '14px' }}>{name}</div>
          <span style={{
            fontSize: '10px',
            color: '#8b6914',
            padding: '2px 8px',
            background: '#2a2018',
            borderRadius: '3px',
          }}>
            {model}
          </span>
        </div>
        <div style={{
          textAlign: 'right',
        }}>
          <div style={{
            fontSize: '20px',
            fontWeight: 'bold',
            color: eloColor,
            fontFamily: '"Press Start 2P", monospace',
            textShadow: `0 0 8px ${eloColor}33`,
          }}>
            {elo}
          </div>
          <div style={{
            fontSize: '8px',
            fontFamily: '"Press Start 2P", monospace',
            color: '#555',
            letterSpacing: '0.15em',
            marginTop: '2px',
          }}>
            ELO
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{
        height: '1px',
        background: 'linear-gradient(to right, #c4952a33, #c4952a, #c4952a33)',
        marginBottom: '12px',
      }} />

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        marginBottom: '12px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#22c55e', fontWeight: 'bold' }}>
            {wins ?? 0}
          </div>
          <div className="label" style={{ marginTop: '2px' }}>Wins</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#ef4444', fontWeight: 'bold' }}>
            {losses ?? 0}
          </div>
          <div className="label" style={{ marginTop: '2px' }}>Losses</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#e8dcc8', fontWeight: 'bold' }}>
            {matchesPlayed}
          </div>
          <div className="label" style={{ marginTop: '2px' }}>Total</div>
        </div>
      </div>

      {/* Win rate bar */}
      {winRate !== null && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            marginBottom: '4px',
          }}>
            <span className="label">Win Rate</span>
            <span style={{
              color: winRate >= 60 ? '#22c55e' : winRate >= 40 ? '#c4952a' : '#ef4444',
              fontWeight: 'bold',
              fontSize: '11px',
            }}>
              {winRate}%
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            background: '#0f0f13',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${winRate}%`,
              height: '100%',
              background: winRate >= 60
                ? 'linear-gradient(to right, #22c55e, #22c55e)'
                : winRate >= 40
                ? 'linear-gradient(to right, #c4952a, #8b6914)'
                : 'linear-gradient(to right, #ef4444, #dc2626)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Footer - wallet + HCS */}
      <div style={{
        borderTop: '1px solid #333',
        paddingTop: '8px',
      }}>
        <div style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>
          {short}
        </div>
        {hcsTopicId && (
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '8px',
              fontFamily: '"Press Start 2P", monospace',
              color: '#c4952a',
              letterSpacing: '0.1em',
            }}>
              HCS-10
            </span>
            <a
              href={`https://hashscan.io/testnet/topic/${hcsTopicId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#8b6914',
                textDecoration: 'none',
                fontSize: '11px',
                fontFamily: 'monospace',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dcc8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8b6914')}
            >
              {hcsTopicId}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
