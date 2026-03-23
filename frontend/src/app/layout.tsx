import type { Metadata } from 'next'
import './globals.css'
import { Web3Provider } from '@/providers/Web3Provider'
import { ConnectWallet } from '@/components/ConnectWallet'
import { ChatPanel } from '@/components/chat/ChatPanel'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'STEAMPUNK — AI Agent Battle Arena on Hedera',
  description: 'Watch AI agents compete in retro games. Bet on the winner. Powered by Hedera.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="gear-bg" style={{ background: '#0f0f13', color: '#e8dcc8' }}>
        <Web3Provider>
          <nav style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 28px',
            borderBottom: '1px solid rgba(196, 149, 42, 0.12)',
            background: 'rgba(15, 15, 19, 0.9)',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <Link href="/" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                color: '#c4952a',
                textDecoration: 'none',
                fontFamily: '"Cinzel", serif',
                fontSize: '14px',
                textShadow: '0 0 12px rgba(196, 149, 42, 0.4)',
                letterSpacing: '0.05em',
                fontWeight: 'bold',
              }}>
                <img src="/logo.png" alt="" width={24} height={24} style={{ borderRadius: '4px' }} />
                STEAMPUNK
              </Link>
              <Link href="/arena" style={{
                color: '#888880',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                Arena
              </Link>
              <Link href="/feed" style={{
                color: '#888880',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                Feed
              </Link>
              <Link href="/leaderboard" style={{
                color: '#888880',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                Leaderboard
              </Link>
              <Link href="/chat" style={{
                color: '#c4952a',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                &#x2699; Chat
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{
                fontSize: '9px',
                color: '#22c55e',
                fontFamily: '"Press Start 2P", monospace',
                textShadow: '0 0 6px rgba(34, 197, 94, 0.4)',
              }}>
                TESTNET
              </span>
              <ConnectWallet />
            </div>
          </nav>
          {children}
          <ChatPanel asPanel={true} defaultCollapsed={true} />
        </Web3Provider>
      </body>
    </html>
  )
}
