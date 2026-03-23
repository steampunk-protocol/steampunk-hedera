'use client'

export default function MatchError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#e8dcc8' }}>
      <h2 style={{ color: '#c4952a', marginBottom: '12px' }}>Match Error</h2>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px', fontFamily: 'monospace' }}>
        {error.message}
      </p>
      <pre style={{ color: '#555', fontSize: '10px', textAlign: 'left', maxWidth: '600px', margin: '0 auto', overflow: 'auto' }}>
        {error.stack}
      </pre>
      <button onClick={reset} style={{ marginTop: '16px', padding: '8px 24px', background: '#c4952a', color: '#0f0f13', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        Retry
      </button>
    </div>
  )
}
