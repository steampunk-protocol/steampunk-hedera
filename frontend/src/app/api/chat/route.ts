import { NextRequest, NextResponse } from 'next/server'

const ARENA_API = process.env.NEXT_PUBLIC_ARENA_API_URL || 'http://localhost:8000'

/**
 * Proxy endpoint for sending chat messages to the matchmaker agent via the arena server.
 * The browser cannot submit HCS messages directly — it requires the operator private key.
 * This route forwards the request to the arena server which holds the key.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { topic_id, message } = body

    if (!message || !topic_id) {
      return NextResponse.json(
        { error: 'Missing topic_id or message' },
        { status: 400 },
      )
    }

    const res = await fetch(`${ARENA_API}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic_id,
        message,
        sender: 'spectator',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Arena server error: ${text}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
