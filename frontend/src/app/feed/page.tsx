'use client'

import { useHCSFeed } from '@/hooks/useHCSFeed'

const TOPIC_ID = process.env.NEXT_PUBLIC_HCS_MATCH_TOPIC_ID || ''

export default function FeedPage() {
  const { messages, loading, error } = useHCSFeed(TOPIC_ID)

  return (
    <main style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ color: '#b5a642', marginBottom: '8px', fontSize: '1rem' }}>
        HCS MATCH FEED
      </h1>
      <p style={{ color: '#666', fontSize: '13px', marginBottom: '4px' }}>
        Live match events published via Hedera Consensus Service
      </p>
      {TOPIC_ID && (
        <p style={{ color: '#555', fontSize: '11px', fontFamily: 'monospace', marginBottom: '24px' }}>
          Topic:{' '}
          <a
            href={`https://hashscan.io/testnet/topic/${TOPIC_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#B87333' }}
          >
            {TOPIC_ID}
          </a>
        </p>
      )}

      {!TOPIC_ID && (
        <div className="panel" style={{ marginBottom: '16px', borderColor: '#B87333' }}>
          <p style={{ color: '#B87333', fontSize: '12px' }}>
            Set NEXT_PUBLIC_HCS_MATCH_TOPIC_ID in .env.local to connect to the match feed topic.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Fetching HCS messages...
          </div>
        )}
        {error && (
          <div style={{ padding: '16px', color: '#ef4444', fontSize: '13px' }}>
            {error}
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#555' }}>
            No messages yet. Waiting for match activity...
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.sequence_number}
            className="panel"
            style={{ padding: '12px 16px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{
                fontSize: '11px',
                color: msg.parsed?.type ? '#B8860B' : '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {(msg.parsed?.type as string) ?? 'message'}
              </span>
              <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>
                #{msg.sequence_number} · {new Date(msg.consensus_timestamp * 1000).toLocaleTimeString()}
              </span>
            </div>
            {!!msg.parsed?.match_id && (
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
                Match: <span style={{ color: '#e8dcc8' }}>{String(msg.parsed.match_id)}</span>
              </div>
            )}
            <pre style={{
              fontSize: '11px',
              color: '#666',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: '120px',
              overflow: 'hidden',
            }}>
              {msg.raw_message}
            </pre>
          </div>
        ))}
      </div>
    </main>
  )
}
