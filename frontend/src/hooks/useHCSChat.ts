'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

const MIRROR_NODE = 'https://testnet.mirrornode.hedera.com/api/v1'
const MATCHMAKER_TOPIC = '0.0.8187174'
const POLL_INTERVAL_MS = 3000

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  timestamp: number
  sequenceNumber?: number
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

function tryParseJSON(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function extractChatContent(raw: string): { role: 'user' | 'agent' | 'system'; content: string } | null {
  const parsed = tryParseJSON(raw)
  if (!parsed) return null

  // HCS-10 chat messages have a type field
  const msgType = parsed.type as string | undefined
  const data = (parsed.data as string) || (parsed.message as string) || (parsed.content as string) || ''

  if (msgType === 'chat_user' || msgType === 'user_message') {
    return { role: 'user', content: data || raw }
  }
  if (msgType === 'chat_agent' || msgType === 'agent_response' || msgType === 'matchmaker_response') {
    return { role: 'agent', content: data || raw }
  }
  // Generic HCS-10 messages from the matchmaker
  if (msgType === 'agent_message' || msgType === 'response') {
    return { role: 'agent', content: data || raw }
  }

  // If it looks like a chat message but has no recognized type, show as system
  if (data) {
    return { role: 'system', content: data }
  }

  return null
}

const ARENA_API = process.env.NEXT_PUBLIC_ARENA_API_URL || 'http://localhost:8000'

export function useHCSChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const nextTimestampRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const seenSeqsRef = useRef<Set<number>>(new Set())

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '25', order: 'asc' })
      if (nextTimestampRef.current) {
        params.set('timestamp', `gt:${nextTimestampRef.current}`)
      }

      const url = `${MIRROR_NODE}/topics/${MATCHMAKER_TOPIC}/messages?${params.toString()}`
      const res = await fetch(url)

      if (!res.ok) {
        if (res.status === 404) {
          setError(`Matchmaker topic ${MATCHMAKER_TOPIC} not found`)
          return
        }
        throw new Error(`Mirror node HTTP ${res.status}`)
      }

      const data = await res.json() as { messages: MirrorNodeMessage[] }
      const incoming = data.messages ?? []

      if (incoming.length === 0) return

      // Advance cursor
      const last = incoming[incoming.length - 1]
      nextTimestampRef.current = last.consensus_timestamp

      const newMessages: ChatMessage[] = []

      for (const m of incoming) {
        if (seenSeqsRef.current.has(m.sequence_number)) continue
        seenSeqsRef.current.add(m.sequence_number)

        const raw = decodeBase64(m.message)
        const chatContent = extractChatContent(raw)
        if (!chatContent) continue

        const ts = parseFloat(m.consensus_timestamp)
        newMessages.push({
          id: `hcs-${m.sequence_number}`,
          role: chatContent.role,
          content: chatContent.content,
          timestamp: ts,
          sequenceNumber: m.sequence_number,
        })
      }

      if (newMessages.length > 0) {
        setMessages(prev => [...prev, ...newMessages].slice(-200))
      }

      setError('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages'
      setError(message)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    nextTimestampRef.current = null
    seenSeqsRef.current = new Set()

    fetchMessages().finally(() => setLoading(false))

    intervalRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalRef.current)
    }
  }, [fetchMessages])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    // Optimistically add the user message to chat
    const optimisticMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now() / 1000,
    }
    setMessages(prev => [...prev, optimisticMsg])
    setSending(true)
    setError('')

    try {
      // POST to arena server which has the operator key to submit HCS messages
      const res = await fetch(`${ARENA_API}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: MATCHMAKER_TOPIC,
          message: content.trim(),
          sender: 'spectator',
        }),
      })

      if (!res.ok) {
        // Fallback: try the Next.js API route proxy
        const fallbackRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic_id: MATCHMAKER_TOPIC,
            message: content.trim(),
          }),
        })

        if (!fallbackRes.ok) {
          throw new Error('Failed to send message — arena server unavailable')
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send message'
      setError(message)
      // Add error indicator as system message
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'system',
        content: `Failed to send: ${message}. The matchmaker agent may not be running.`,
        timestamp: Date.now() / 1000,
      }])
    } finally {
      setSending(false)
    }
  }, [])

  return { messages, loading, sending, error, sendMessage, topicId: MATCHMAKER_TOPIC }
}
