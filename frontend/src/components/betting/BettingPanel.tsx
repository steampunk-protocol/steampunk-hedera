'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import type { BettingUpdateMessage, PlayerState } from '@/types/ws'
import { CONTRACTS, predictionPoolAbi, erc20Abi } from '@/config/wagmi'

// HTS STEAM token uses 8 decimals
const STEAM_DECIMALS = 8

const AGENT_COLORS = ['#B8860B', '#B87333', '#4ade80', '#60a5fa']

interface Props {
  matchId: string
  bettingState: BettingUpdateMessage | null
  players: PlayerState[]
}

function formatSteam(raw: number): string {
  // raw is in smallest unit (8 decimals)
  const val = raw / 1e8
  return val < 0.00000001 ? '0' : val.toFixed(8).replace(/\.?0+$/, '')
}

type TxStatus = 'idle' | 'approving' | 'betting' | 'success' | 'error'

export function BettingPanel({ matchId, bettingState, players }: Props) {
  const { address, isConnected } = useAccount()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const { writeContractAsync: approve } = useWriteContract()
  const { writeContractAsync: placeBet } = useWriteContract()

  // Read current allowance
  const { data: allowance } = useReadContract({
    address: CONTRACTS.steamToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.predictionPool] : undefined,
    query: { enabled: !!address },
  })

  // Read STEAM balance
  const { data: balance } = useReadContract({
    address: CONTRACTS.steamToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  async function handlePlaceBet() {
    if (!isConnected || !address || !selectedAgent || !betAmount) return

    setErrorMsg('')
    // HTS STEAM uses 8 decimals — use parseUnits with 8, NOT parseEther (18)
    const amountUnits = parseUnits(betAmount, STEAM_DECIMALS)

    try {
      // Check if approval is needed
      const currentAllowance = allowance ?? 0n
      if (currentAllowance < amountUnits) {
        setTxStatus('approving')
        await approve({
          address: CONTRACTS.steamToken,
          abi: erc20Abi,
          functionName: 'approve',
          args: [CONTRACTS.predictionPool, amountUnits],
        })
        // Wait for approval to propagate (~3-5s on Hedera)
        await new Promise(resolve => setTimeout(resolve, 4000))
      }

      // Place the bet
      setTxStatus('betting')
      const matchIdNum = BigInt(matchId)
      await placeBet({
        address: CONTRACTS.predictionPool,
        abi: predictionPoolAbi,
        functionName: 'placeBet',
        args: [matchIdNum, selectedAgent as `0x${string}`, amountUnits],
      })

      setTxStatus('success')
      setBetAmount('')
      setSelectedAgent(null)
    } catch (err: any) {
      setTxStatus('error')
      setErrorMsg(err?.shortMessage || err?.message || 'Transaction failed')
    }
  }

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="label">Prediction Pool</div>

      {players.length === 0 ? (
        <p style={{ color: '#666', fontSize: '13px' }}>Waiting for race to start...</p>
      ) : (
        <>
          {/* Pool bars */}
          {players.map((player, i) => {
            const total = bettingState?.pool_totals?.[player.agent_id] ?? 0
            const odds = bettingState?.implied_odds?.[player.agent_id]
            const color = AGENT_COLORS[i % AGENT_COLORS.length]
            const oddsStr = odds != null ? `${(odds * 100).toFixed(0)}%` : '--'
            const isSelected = selectedAgent === player.agent_id

            return (
              <div
                key={player.agent_id}
                onClick={() => isConnected && setSelectedAgent(player.agent_id)}
                style={{
                  marginBottom: '8px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: isSelected ? `1px solid ${color}` : '1px solid transparent',
                  background: isSelected ? '#2a2a2a' : 'transparent',
                  cursor: isConnected ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color }}>{player.model_name}</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{oddsStr}</span>
                </div>
                <div style={{ background: '#333', borderRadius: '2px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(odds ?? 0) * 100}%`,
                    height: '100%',
                    background: color,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                  {formatSteam(total)} STEAM
                </div>
              </div>
            )
          })}

          {/* Bet form */}
          {isConnected ? (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              background: '#1a1a1a',
              borderRadius: '4px',
            }}>
              {balance !== undefined && (
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                  Balance: {formatUnits(balance, STEAM_DECIMALS)} STEAM
                </div>
              )}

              {selectedAgent ? (
                <>
                  <input
                    type="number"
                    placeholder="Amount (STEAM)"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    min="0"
                    step="0.00000001"
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#242424',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      color: '#F5F5F0',
                      fontSize: '13px',
                      marginBottom: '8px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={handlePlaceBet}
                    disabled={txStatus === 'approving' || txStatus === 'betting' || !betAmount}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: txStatus === 'success' ? '#4ade80' : '#B8860B',
                      color: '#1a1a1a',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: (txStatus === 'approving' || txStatus === 'betting') ? 'wait' : 'pointer',
                      opacity: (txStatus === 'approving' || txStatus === 'betting') ? 0.7 : 1,
                    }}
                  >
                    {txStatus === 'approving' && 'Approving STEAM...'}
                    {txStatus === 'betting' && 'Placing Bet...'}
                    {txStatus === 'success' && 'Bet Placed!'}
                    {txStatus === 'error' && 'Try Again'}
                    {txStatus === 'idle' && 'Place Bet'}
                  </button>

                  {txStatus === 'error' && errorMsg && (
                    <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errorMsg}</p>
                  )}
                  {txStatus === 'success' && (
                    <p style={{ color: '#4ade80', fontSize: '11px', marginTop: '4px' }}>
                      Bet confirmed on Hedera
                    </p>
                  )}
                </>
              ) : (
                <p style={{ color: '#666', fontSize: '12px', textAlign: 'center' }}>
                  Click an agent above to bet on them
                </p>
              )}
            </div>
          ) : (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              background: '#1a1a1a',
              borderRadius: '4px',
              textAlign: 'center',
              color: '#555',
              fontSize: '12px',
            }}>
              Connect wallet to place bet
            </div>
          )}

          {/* Total pool */}
          {bettingState && (
            <div style={{ borderTop: '1px solid #333', paddingTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="label">Total Pool</span>
                <span style={{ color: '#B8860B', fontWeight: 'bold' }}>
                  {formatSteam(bettingState.total_pool_wei)} STEAM
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
