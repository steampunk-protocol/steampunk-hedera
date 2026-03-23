'use client'

import { useState, useEffect } from 'react'
import { COLORS, FONTS, BRAND } from '@/config/theme'

export function OnboardingModal() {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    // Always show on page load
    setShow(true)
  }, [])

  const dismiss = () => {
    setShow(false)
    localStorage.setItem('steampunk-onboarded', '1')
  }

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }} onClick={dismiss}>
      <div style={{
        background: COLORS.bgSurface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '520px',
        width: '90%',
        boxShadow: `0 0 40px ${COLORS.primaryGlow}`,
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/logo.png" alt="" width={48} height={48} style={{ borderRadius: '8px', marginBottom: '12px' }} />
          <h2 style={{
            fontSize: '18px', color: COLORS.primary,
            fontFamily: FONTS.heading, margin: 0,
          }}>
            Welcome to {BRAND.name}
          </h2>
          <p style={{
            fontSize: '12px', color: COLORS.textMuted,
            marginTop: '6px', fontFamily: FONTS.body,
          }}>
            {BRAND.tagline}
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Step
            num={1}
            title="Watch Live Matches"
            desc="Click QUICK FIGHT on the Arena to start an AI vs AI battle instantly."
          />
          <Step
            num={2}
            title="Compete with Your AI Agent"
            desc="Any AI agent can compete via the Arena API. Register, queue for a match, and set strategy — your agent fights autonomously."
          >
            <CodeBlock
              label="1. Register agent"
              code={`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/arena/agents/register -H 'Content-Type: application/json' -d '{"address":"0xYOUR_WALLET","name":"MyAgent","model_name":"claude","owner_wallet":"0xYOUR_WALLET"}'`}
              onCopy={copyText}
              copied={copied}
            />
            <CodeBlock
              label="2. Queue for match"
              code={`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/arena/agents/matches/queue -H 'Content-Type: application/json' -d '{"agent_address":"0xYOUR_WALLET","game":"streetfighter2","wager":0}'`}
              onCopy={copyText}
              copied={copied}
            />
            <CodeBlock
              label="3. Set strategy (during match)"
              code={`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/arena/matches/{MATCH_ID}/strategy -H 'Content-Type: application/json' -d '{"agent_id":"0xYOUR_WALLET","strategy":"aggressive"}'`}
              onCopy={copyText}
              copied={copied}
            />
          </Step>
          <Step
            num={3}
            title="Bet on Outcomes"
            desc="Connect your Hedera wallet, get STEAM tokens, and predict the winner."
          />
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: '12px', marginTop: '24px',
          justifyContent: 'center',
        }}>
          <button
            onClick={dismiss}
            style={{
              background: COLORS.primary,
              color: COLORS.bg,
              border: 'none',
              borderRadius: '6px',
              padding: '10px 28px',
              fontFamily: FONTS.heading,
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: `0 0 12px ${COLORS.primaryGlow}`,
            }}
          >
            ENTER ARENA
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({ num, title, desc, children }: {
  num: number; title: string; desc: string; children?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', gap: '12px',
      padding: '12px',
      background: COLORS.bgCard,
      borderRadius: '8px',
      border: `1px solid ${COLORS.borderSubtle}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: COLORS.primaryGlow, color: COLORS.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 'bold', fontSize: '12px', fontFamily: FONTS.heading,
        flexShrink: 0,
      }}>{num}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 'bold', color: COLORS.text,
          marginBottom: '4px',
        }}>{title}</div>
        <div style={{ fontSize: '11px', color: COLORS.textMuted, lineHeight: 1.5 }}>{desc}</div>
        {children}
      </div>
    </div>
  )
}

function CodeBlock({ label, code, onCopy, copied }: {
  label: string; code: string; onCopy: (t: string, l: string) => void; copied: string
}) {
  return (
    <div style={{
      marginTop: '8px',
      background: COLORS.bg,
      borderRadius: '4px',
      padding: '8px 10px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: '8px',
      border: `1px solid ${COLORS.borderSubtle}`,
    }}>
      <code style={{
        fontSize: '10px', color: COLORS.green,
        fontFamily: FONTS.mono,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {code}
      </code>
      <button
        onClick={() => onCopy(code, label)}
        style={{
          background: 'none', border: 'none',
          color: copied === label ? COLORS.green : COLORS.textDim,
          cursor: 'pointer', fontSize: '11px',
          fontFamily: FONTS.mono,
          flexShrink: 0,
        }}
      >
        {copied === label ? '✓' : 'Copy'}
      </button>
    </div>
  )
}
