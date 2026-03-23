'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
// Import ONLY from generated ws.ts — never redefine these types
import type {
  RaceTickMessage,
  RaceStartMessage,
  RaceEndMessage,
  BettingUpdateMessage,
  AgentReasoningMessage,
  WsMessage,
  PlayerState,
} from '@/types/ws'

import { ARENA_WS as WS_URL } from '@/config/arena'

export interface RaceState {
  match_id: string
  tick: number
  race_status: string // 'waiting' | 'in_progress' | 'finished'
  players: PlayerState[]
  timestamp_ms: number
  track_name?: string
  hcs_match_topic_id?: string
  final_positions?: Record<string, number>
  finish_times_ms?: Record<string, number>
  match_result_hash?: string
  frame_b64?: string | null  // base64 JPEG game frame
}

export function useRaceWebSocket(matchId: string) {
  const [connected, setConnected] = useState(false)
  const [raceState, setRaceState] = useState<RaceState | null>(null)
  const [bettingState, setBettingState] = useState<BettingUpdateMessage | null>(null)
  const [reasoningMap, setReasoningMap] = useState<Record<string, string>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const pingInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL}/matches/${matchId}/stream`

    // Skip WS on HTTPS pages if arena doesn't have WSS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('ws://')) {
      console.warn('Skipping insecure WebSocket from HTTPS page. Arena needs WSS for live streaming.')
      return
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      console.warn('WebSocket connection failed')
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // Keepalive ping every 25s
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
      }, 25000)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        if (msg.type === 'race_start') {
          const start = msg as RaceStartMessage
          setRaceState(prev => ({
            match_id: start.match_id,
            tick: 0,
            race_status: 'in_progress',
            players: start.agents,
            timestamp_ms: start.timestamp_ms,
            track_name: start.track_name,
            hcs_match_topic_id: start.hcs_match_topic_id,
            final_positions: prev?.final_positions,
            finish_times_ms: prev?.finish_times_ms,
            match_result_hash: prev?.match_result_hash,
          }))
        } else if (msg.type === 'race_tick') {
          const tick = msg as RaceTickMessage
          setRaceState(prev => ({
            match_id: tick.match_id,
            tick: tick.tick,
            race_status: tick.race_status,
            players: tick.players,
            timestamp_ms: tick.timestamp_ms,
            track_name: prev?.track_name,
            hcs_match_topic_id: prev?.hcs_match_topic_id,
            final_positions: prev?.final_positions,
            finish_times_ms: prev?.finish_times_ms,
            match_result_hash: prev?.match_result_hash,
            frame_b64: tick.frame_b64 ?? prev?.frame_b64,
          }))
        } else if (msg.type === 'race_end') {
          const end = msg as RaceEndMessage
          setRaceState(prev => prev ? ({
            ...prev,
            race_status: 'finished',
            final_positions: end.final_positions,
            finish_times_ms: end.finish_times_ms,
            match_result_hash: end.match_result_hash,
            timestamp_ms: end.timestamp_ms,
          }) : prev)
        } else if (msg.type === 'betting_update') {
          setBettingState(msg as BettingUpdateMessage)
        } else if (msg.type === 'agent_reasoning') {
          const reasoning = msg as AgentReasoningMessage
          setReasoningMap(prev => ({
            ...prev,
            [reasoning.agent_id]: reasoning.reasoning_text,
          }))
        }
      } catch {
        // ignore parse errors (keepalive pong etc)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      clearInterval(pingInterval.current)
      // Reconnect after 2s
      setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [matchId])

  useEffect(() => {
    connect()
    return () => {
      clearInterval(pingInterval.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { connected, raceState, bettingState, reasoningMap }
}
