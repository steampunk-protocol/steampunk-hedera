'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

const MIRROR_NODE = 'https://testnet.mirrornode.hedera.com/api/v1'
// Poll interval in ms — mirror node updates are ~3-5s behind consensus
const POLL_INTERVAL_MS = 5000

export interface HCSMessage {
  sequence_number: number
  consensus_timestamp: number
  raw_message: string
  parsed: Record<string, unknown> | null
}

interface MirrorNodeMessage {
  sequence_number: number
  consensus_timestamp: string
  message: string // base64 encoded
}

function decodeBase64(b64: string): string {
  try {
    return atob(b64)
  } catch {
    return b64
  }
}

function parseMessage(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function useHCSFeed(topicId: string) {
  const [messages, setMessages] = useState<HCSMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const nextTimestampRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const fetchMessages = useCallback(async () => {
    if (!topicId) return

    try {
      // Use timestamp cursor to only fetch new messages after the last seen
      const params = new URLSearchParams({ limit: '25', order: 'asc' })
      if (nextTimestampRef.current) {
        params.set('timestamp', `gt:${nextTimestampRef.current}`)
      }

      const url = `${MIRROR_NODE}/topics/${topicId}/messages?${params.toString()}`
      const res = await fetch(url)

      if (!res.ok) {
        if (res.status === 404) {
          setError(`Topic ${topicId} not found on Hedera testnet`)
          return
        }
        throw new Error(`Mirror node HTTP ${res.status}`)
      }

      const data = await res.json() as { messages: MirrorNodeMessage[] }
      const incoming = data.messages ?? []

      if (incoming.length === 0) return

      const parsed: HCSMessage[] = incoming.map((m) => {
        const raw = decodeBase64(m.message)
        // consensus_timestamp is "seconds.nanoseconds" string — convert to epoch seconds
        const ts = parseFloat(m.consensus_timestamp)
        return {
          sequence_number: m.sequence_number,
          consensus_timestamp: ts,
          raw_message: raw,
          parsed: parseMessage(raw),
        }
      })

      // Advance cursor to last message timestamp
      const last = incoming[incoming.length - 1]
      nextTimestampRef.current = last.consensus_timestamp

      setMessages(prev => {
        // Deduplicate by sequence_number
        const existingSeqs = new Set(prev.map(m => m.sequence_number))
        const newOnes = parsed.filter(m => !existingSeqs.has(m.sequence_number))
        if (newOnes.length === 0) return prev
        // Prepend newest messages at top, cap at 200
        return [...newOnes.reverse(), ...prev].slice(0, 200)
      })

      setError('')
    } catch (err: any) {
      setError(err.message || 'Failed to fetch HCS messages')
    }
  }, [topicId])

  useEffect(() => {
    if (!topicId) return

    setLoading(true)
    nextTimestampRef.current = null

    fetchMessages().finally(() => setLoading(false))

    intervalRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalRef.current)
    }
  }, [topicId, fetchMessages])

  return { messages, loading, error }
}
