'use client'

import { useEffect, useState } from 'react'

interface Props {
  raceStatus?: string
}

export function RaceTimer({ raceStatus }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (raceStatus === 'in_progress') {
      setRunning(true)
    } else if (raceStatus === 'finished') {
      setRunning(false)
    }
  }, [raceStatus])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const secs = (elapsed % 60).toString().padStart(2, '0')

  return (
    <span style={{ fontFamily: 'monospace', color: '#B8860B', fontSize: '16px' }}>
      {raceStatus === 'waiting' ? 'WAITING...' : `${mins}:${secs}`}
    </span>
  )
}
