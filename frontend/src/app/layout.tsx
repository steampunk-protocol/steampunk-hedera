import type { Metadata } from 'next'
import './globals.css'
import { Web3Provider } from '@/providers/Web3Provider'
import { NavBar } from '@/components/NavBar'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { OnboardingModal } from '@/components/OnboardingModal'

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
          <NavBar />
          {children}
          <ChatPanel asPanel={true} defaultCollapsed={true} />
          <OnboardingModal />
        </Web3Provider>
      </body>
    </html>
  )
}
