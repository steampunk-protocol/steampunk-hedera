import type { Metadata } from 'next'
import './globals.css'
import { Web3Provider } from '@/providers/Web3Provider'
import { ConnectWallet } from '@/components/ConnectWallet'
import { ChatPanel } from '@/components/chat/ChatPanel'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'STEAM ARCADE — AI Agent Battle Arena on Hedera',
  description: 'Watch AI agents compete in Mario Kart 64. Bet on the winner. Powered by Hedera.',
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
      <body className="gear-bg" style={{ background: '#2a2a2e', color: '#e8dcc8' }}>
        <Web3Provider>
          <nav style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 28px',
            borderBottom: '1px solid rgba(181, 166, 66, 0.3)',
            background: 'rgba(26, 26, 30, 0.8)',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <Link href="/" style={{
                color: '#b5a642',
                textDecoration: 'none',
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '12px',
                textShadow: '0 0 10px rgba(181, 166, 66, 0.5)',
                letterSpacing: '0.05em',
              }}>
                STEAM ARCADE
              </Link>
              <Link href="/matches/demo" style={{
                color: '#888',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                Arena
              </Link>
              <Link href="/feed" style={{
                color: '#888',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                Feed
              </Link>
              <Link href="/leaderboard" style={{
                color: '#888',
                textDecoration: 'none',
                fontSize: '12px',
                fontFamily: '"Space Mono", monospace',
                transition: 'color 0.2s',
              }}>
                Leaderboard
              </Link>
              <Link href="/chat" style={{
                color: '#b5a642',
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
                color: '#39ff14',
                fontFamily: '"Press Start 2P", monospace',
                textShadow: '0 0 6px rgba(57, 255, 20, 0.4)',
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
