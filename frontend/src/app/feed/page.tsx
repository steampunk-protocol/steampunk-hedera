'use client'

import { useState, useMemo } from 'react'
import { useHCSFeed } from '@/hooks/useHCSFeed'

const TOPIC_ID = process.env.NEXT_PUBLIC_HCS_MATCH_TOPIC_ID || ''

const AGENT_NAMES: Record<string, string> = {
  '0.0.8205003': 'Matchmaker',
  '0.0.8205016': 'MarioAgent',
  '0.0.8205055': 'LuigiAgent',
}

type MessageType = 'all' | 'queue_join' | 'match_found' | 'match_result' | 'chat' | 'connection_request' | 'connection_created' | 'message' | 'other'

const MESSAGE_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  queue_join: { bg: '#1a2e1a', color: '#4ade80' },
  match_found: { bg: '#2e2a1a', color: '#B8860B' },
  match_result: { bg: '#2e1a1a', color: '#ef4444' },
  chat: { bg: '#1a1a2e', color: '#60a5fa' },
  connection_request: { bg: '#2e1a2e', color: '#c084fc' },
  connection_created: { bg: '#1a2e2e', color: '#2dd4bf' },
  message: { bg: '#1e2a1e', color: '#86efac' },
  other: { bg: '#2a2a2a', color: '#666' },
}

const FILTER_OPTIONS: { value: MessageType; label: string }[] = [
  { value: 'all', label: 'ALL' },
  { value: 'queue_join', label: 'QUEUE' },
  { value: 'match_found', label: 'MATCH' },
  { value: 'match_result', label: 'RESULT' },
  { value: 'chat', label: 'CHAT' },
  { value: 'connection_request', label: 'CONN REQ' },
  { value: 'connection_created', label: 'CONN OK' },
  { value: 'message', label: 'MSG' },
]

function resolveMessageType(parsed: Record<string, unknown> | null): string {
  if (!parsed) return 'other'

  // HCS-10 standard types
  if (parsed.type && typeof parsed.type === 'string') return parsed.type

  // Check for op field (HCS-10 connection messages)
  if (parsed.op && typeof parsed.op === 'string') return parsed.op

  return 'other'
}

function resolveAgentName(topicId: string | unknown): string | null {
  if (typeof topicId !== 'string') return null
  return AGENT_NAMES[topicId] || null
}

function formatPayload(parsed: Record<string, unknown> | null, raw: string): string {
  if (!parsed) return raw

  // For message type with data payload, show decoded data
  if (parsed.data && typeof parsed.data === 'string') {
    try {
      const inner = JSON.parse(parsed.data)
      return JSON.stringify(inner, null, 2)
    } catch {
      return parsed.data
    }
  }

  return JSON.stringify(parsed, null, 2)
}

export default function FeedPage() {
  const { messages, loading, error } = useHCSFeed(TOPIC_ID)
  const [activeFilter, setActiveFilter] = useState<MessageType>('all')

  const filteredMessages = useMemo(() => {
    if (activeFilter === 'all') return messages
    return messages.filter((msg) => {
      const type = resolveMessageType(msg.parsed)
      return type === activeFilter
    })
  }, [messages, activeFilter])

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

      {/* Filter buttons */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {FILTER_OPTIONS.map((opt) => {
          const isActive = activeFilter === opt.value
          const typeColor = opt.value === 'all'
            ? { bg: '#2a2a2e', color: '#b5a642' }
            : MESSAGE_TYPE_COLORS[opt.value] || MESSAGE_TYPE_COLORS.other
          return (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              style={{
                padding: '4px 10px',
                fontSize: '9px',
                fontFamily: '"Press Start 2P", monospace',
                letterSpacing: '0.05em',
                background: isActive ? typeColor.bg : 'transparent',
                color: isActive ? typeColor.color : '#555',
                border: `1px solid ${isActive ? typeColor.color : '#333'}`,
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Message count */}
      {!loading && messages.length > 0 && (
        <p style={{ color: '#444', fontSize: '10px', marginBottom: '12px', fontFamily: 'monospace' }}>
          Showing {filteredMessages.length} of {messages.length} messages
        </p>
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
        {!loading && !error && filteredMessages.length === 0 && messages.length > 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#555' }}>
            No messages match this filter.
          </div>
        )}
        {filteredMessages.map((msg) => {
          const msgType = resolveMessageType(msg.parsed)
          const typeStyle = MESSAGE_TYPE_COLORS[msgType] || MESSAGE_TYPE_COLORS.other

          // Extract agent references from parsed message
          const originTopic = msg.parsed?.p_origin_topic as string | undefined
          const originAgent = resolveAgentName(originTopic)
          const agentId = msg.parsed?.agent_id as string | undefined
          const agentName = resolveAgentName(agentId)

          return (
            <div
              key={msg.sequence_number}
              className="panel"
              style={{ padding: '12px 16px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Message type badge */}
                  <span style={{
                    fontSize: '8px',
                    fontFamily: '"Press Start 2P", monospace',
                    color: typeStyle.color,
                    background: typeStyle.bg,
                    padding: '3px 8px',
                    borderRadius: '3px',
                    border: `1px solid ${typeStyle.color}33`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {msgType.replace(/_/g, ' ')}
                  </span>

                  {/* Agent name if found */}
                  {(originAgent || agentName) && (
                    <span style={{
                      fontSize: '11px',
                      color: '#B87333',
                      fontWeight: 'bold',
                    }}>
                      {originAgent || agentName}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>
                    #{msg.sequence_number} · {new Date(msg.consensus_timestamp * 1000).toLocaleTimeString()}
                  </span>
                  {/* HashScan link */}
                  <a
                    href={`https://hashscan.io/testnet/topic/${TOPIC_ID}/message/${msg.sequence_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '9px',
                      color: '#B87333',
                      textDecoration: 'none',
                      border: '1px solid #333',
                      padding: '1px 6px',
                      borderRadius: '2px',
                      fontFamily: 'monospace',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#B87333')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
                  >
                    HashScan
                  </a>
                </div>
              </div>

              {/* Match ID */}
              {!!msg.parsed?.match_id && (
                <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
                  Match: <span style={{ color: '#e8dcc8' }}>{String(msg.parsed.match_id)}</span>
                </div>
              )}

              {/* Origin topic with agent name */}
              {originTopic && (
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>
                  From:{' '}
                  <a
                    href={`https://hashscan.io/testnet/topic/${originTopic}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#B87333', textDecoration: 'none' }}
                  >
                    {originAgent ? `${originAgent} (${originTopic})` : originTopic}
                  </a>
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
                {formatPayload(msg.parsed, msg.raw_message)}
              </pre>
            </div>
          )
        })}
      </div>
    </main>
  )
}
