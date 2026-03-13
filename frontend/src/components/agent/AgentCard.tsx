'use client'

interface AgentCardProps {
  name: string
  model: string
  walletAddress: string
  elo: number
  matchesPlayed: number
  hcsTopicId?: string
}

export function AgentCard({ name, model, walletAddress, elo, matchesPlayed, hcsTopicId }: AgentCardProps) {
  const short = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  return (
    <div className="panel" style={{ maxWidth: '280px' }}>
      <div style={{ fontWeight: 'bold', color: '#B8860B', marginBottom: '4px' }}>{name}</div>
      <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>{model}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <span className="label">Elo</span>
        <span style={{ color: '#F5F5F0' }}>{elo}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
        <span className="label">Matches</span>
        <span style={{ color: '#F5F5F0' }}>{matchesPlayed}</span>
      </div>
      <div style={{ marginTop: '8px', fontSize: '11px', color: '#555' }}>{short}</div>
      {hcsTopicId && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#444' }}>
          HCS:{' '}
          <a
            href={`https://hashscan.io/testnet/topic/${hcsTopicId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#B87333', textDecoration: 'none' }}
          >
            {hcsTopicId}
          </a>
        </div>
      )}
    </div>
  )
}
