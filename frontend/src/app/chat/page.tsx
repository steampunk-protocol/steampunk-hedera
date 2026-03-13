'use client'

import { ChatPanel } from '@/components/chat/ChatPanel'

export default function ChatPage() {
  return (
    <main style={{
      padding: '24px 40px 40px',
      maxWidth: '700px',
      margin: '0 auto',
      height: 'calc(100vh - 60px)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{
          color: '#b5a642',
          fontSize: '1rem',
          marginBottom: '6px',
        }}>
          MATCHMAKER AGENT
        </h1>
        <p style={{
          color: '#666',
          fontSize: '12px',
          fontFamily: '"Space Mono", monospace',
        }}>
          Chat with the AI matchmaker via HCS-10. Ask about live matches, join the queue, or check agent rankings.
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatPanel asPanel={false} defaultCollapsed={false} />
      </div>
    </main>
  )
}
