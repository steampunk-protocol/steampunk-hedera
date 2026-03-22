'use client'

import { useState, useRef, useEffect } from 'react'
import { useHCSChat, type ChatMessage } from '@/hooks/useHCSChat'

const QUICK_COMMANDS = [
  'Find me a match',
  'What matches are live?',
  'Show agent leaderboard',
  'Join the queue',
  'Who is the top agent?',
]

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '6px 12px',
        margin: '4px 0',
      }}>
        <span style={{
          fontSize: '11px',
          color: '#666',
          fontStyle: 'italic',
          fontFamily: '"Space Mono", monospace',
        }}>
          {msg.content}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '8px',
      padding: '0 8px',
    }}>
      {!isUser && (
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c4952a, #8b6914)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          flexShrink: 0,
          marginRight: '8px',
          marginTop: '2px',
          boxShadow: '0 0 8px rgba(196, 149, 42, 0.3)',
        }}>
          &#x2699;
        </div>
      )}
      <div style={{
        maxWidth: '75%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser
          ? 'linear-gradient(135deg, #3a3520, #2a2510)'
          : '#1a1a22',
        border: isUser
          ? '1px solid rgba(196, 149, 42, 0.3)'
          : '1px solid rgba(196, 149, 42, 0.15)',
        boxShadow: isUser
          ? '0 0 6px rgba(196, 149, 42, 0.1)'
          : '0 0 4px rgba(0, 0, 0, 0.3)',
      }}>
        <p style={{
          fontSize: '13px',
          lineHeight: 1.5,
          color: isUser ? '#e8dcc8' : '#ccc',
          margin: 0,
          fontFamily: '"Space Mono", monospace',
          wordBreak: 'break-word',
        }}>
          {msg.content}
        </p>
        <div style={{
          fontSize: '9px',
          color: '#555',
          marginTop: '4px',
          textAlign: isUser ? 'right' : 'left',
          fontFamily: '"Space Mono", monospace',
        }}>
          {formatTime(msg.timestamp)}
          {msg.sequenceNumber != null && (
            <span style={{ marginLeft: '6px', color: '#444' }}>#{msg.sequenceNumber}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      marginBottom: '8px',
    }}>
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #c4952a, #8b6914)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        animation: 'spin 3s linear infinite',
        boxShadow: '0 0 8px rgba(196, 149, 42, 0.3)',
      }}>
        &#x2699;
      </div>
      <span style={{
        fontSize: '12px',
        color: '#888',
        fontFamily: '"Space Mono", monospace',
        fontStyle: 'italic',
      }}>
        Matchmaker thinking...
      </span>
    </div>
  )
}

interface ChatPanelProps {
  /** Render as a collapsible side panel (true) or as inline content (false) */
  asPanel?: boolean
  /** Default collapsed state for panel mode */
  defaultCollapsed?: boolean
}

export function ChatPanel({ asPanel = true, defaultCollapsed = true }: ChatPanelProps) {
  const { messages, loading, sending, error, sendMessage, topicId } = useHCSChat()
  const [input, setInput] = useState('')
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [showCommands, setShowCommands] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    sendMessage(input)
    setInput('')
    setShowCommands(false)
  }

  function handleQuickCommand(cmd: string) {
    sendMessage(cmd)
    setShowCommands(false)
  }

  // Panel toggle button (for collapsed state)
  if (asPanel && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c4952a, #8b6914)',
          border: '2px solid rgba(196, 149, 42, 0.5)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          boxShadow: '0 4px 20px rgba(196, 149, 42, 0.3), 0 0 40px rgba(196, 149, 42, 0.1)',
          zIndex: 1000,
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 4px 24px rgba(196, 149, 42, 0.5), 0 0 60px rgba(196, 149, 42, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(196, 149, 42, 0.3), 0 0 40px rgba(196, 149, 42, 0.1)'
        }}
        title="Chat with Matchmaker Agent"
      >
        &#x2699;
      </button>
    )
  }

  const containerStyle: React.CSSProperties = asPanel
    ? {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '380px',
        height: '560px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(196, 149, 42, 0.3)',
        background: '#1a1a22',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(196, 149, 42, 0.08)',
      }
    : {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(196, 149, 42, 0.3)',
        background: '#1a1a22',
      }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: 'linear-gradient(135deg, #1a1a22, #252528)',
        borderBottom: '1px solid rgba(196, 149, 42, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 6px rgba(34, 197, 94, 0.4)',
          }} />
          <div>
            <div style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '8px',
              color: '#c4952a',
              letterSpacing: '0.1em',
            }}>
              MATCHMAKER AGENT
            </div>
            <div style={{
              fontSize: '9px',
              color: '#555',
              fontFamily: '"Space Mono", monospace',
              marginTop: '2px',
            }}>
              <a
                href={`https://hashscan.io/testnet/topic/${topicId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#666', textDecoration: 'none' }}
              >
                {topicId}
              </a>
            </div>
          </div>
        </div>
        {asPanel && (
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px',
              lineHeight: 1,
            }}
            title="Minimize chat"
          >
            &#x2715;
          </button>
        )}
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#666',
            fontSize: '12px',
            fontFamily: '"Space Mono", monospace',
          }}>
            Connecting to HCS topic...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#555',
          }}>
            <div style={{
              fontSize: '32px',
              marginBottom: '12px',
              color: '#c4952a',
              opacity: 0.5,
            }}>
              &#x2699;
            </div>
            <p style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '9px',
              color: '#c4952a',
              marginBottom: '8px',
              letterSpacing: '0.05em',
            }}>
              MATCHMAKER AGENT
            </p>
            <p style={{
              fontSize: '12px',
              color: '#666',
              fontFamily: '"Space Mono", monospace',
              lineHeight: 1.6,
            }}>
              Ask me to find a match, check live games, or query the leaderboard.
              All messages are published via HCS.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {sending && <ThinkingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick commands */}
      {showCommands && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid rgba(196, 149, 42, 0.1)',
          background: '#1a1a22',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => handleQuickCommand(cmd)}
              style={{
                background: 'rgba(196, 149, 42, 0.08)',
                border: '1px solid rgba(196, 149, 42, 0.2)',
                borderRadius: '12px',
                padding: '4px 10px',
                color: '#c4952a',
                fontSize: '10px',
                fontFamily: '"Space Mono", monospace',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(196, 149, 42, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(196, 149, 42, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(196, 149, 42, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(196, 149, 42, 0.2)'
              }}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div style={{
          padding: '6px 12px',
          background: 'rgba(239, 68, 68, 0.1)',
          borderTop: '1px solid rgba(239, 68, 68, 0.2)',
          fontSize: '10px',
          color: '#ef4444',
          fontFamily: '"Space Mono", monospace',
        }}>
          {error}
        </div>
      )}

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px',
          borderTop: '1px solid rgba(196, 149, 42, 0.15)',
          background: '#1a1a22',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setShowCommands(prev => !prev)}
          style={{
            background: 'none',
            border: '1px solid rgba(196, 149, 42, 0.2)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            color: showCommands ? '#c4952a' : '#666',
            fontSize: '16px',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          title="Quick commands"
        >
          /
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the matchmaker..."
          disabled={sending}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#0f0f13',
            border: '1px solid rgba(196, 149, 42, 0.15)',
            borderRadius: '6px',
            color: '#e8dcc8',
            fontSize: '13px',
            fontFamily: '"Space Mono", monospace',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(196, 149, 42, 0.4)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(196, 149, 42, 0.15)'
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            background: input.trim()
              ? 'linear-gradient(135deg, #c4952a, #8b6914)'
              : '#333',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 14px',
            color: input.trim() ? '#1a1a22' : '#666',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: input.trim() ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'all 0.15s',
            boxShadow: input.trim() ? '0 2px 8px rgba(196, 149, 42, 0.2)' : 'none',
          }}
        >
          {sending ? '...' : '\u2191'}
        </button>
      </form>

      {/* Inline animation keyframes for the thinking gear */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
