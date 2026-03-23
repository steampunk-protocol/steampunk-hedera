'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectWallet } from '@/components/ConnectWallet'

const NAV_LINKS = [
  { href: '/arena', label: 'Arena' },
  { href: '/feed', label: 'Feed' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/chat', label: '⚙ Chat' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
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
        {NAV_LINKS.map(link => {
          const isActive = pathname === link.href || pathname?.startsWith(link.href + '/')
          return (
            <Link key={link.href} href={link.href} style={{
              color: isActive ? '#c4952a' : '#888880',
              textDecoration: 'none',
              fontSize: '12px',
              fontFamily: '"Space Mono", monospace',
              transition: 'color 0.2s',
              borderBottom: isActive ? '2px solid #c4952a' : '2px solid transparent',
              paddingBottom: '2px',
            }}>
              {link.label}
            </Link>
          )
        })}
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
  )
}
