/**
 * types.ts — HCS-10 Message Protocol Types for Agent Colosseum
 *
 * Defines all structured message types exchanged between agents and the
 * matchmaker over HCS-10 connection topics.
 */

// ---------- Message type discriminator ----------

export const MESSAGE_TYPES = [
  "queue_join",
  "match_found",
  "match_accept",
  "match_start",
  "match_result",
  "chat",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

// ---------- Individual message payloads ----------

export interface QueueJoinMessage {
  type: "queue_join";
  game: string;
  /** Wager amount in STEAM token (8 decimals). Integer units, not float. */
  wager: number;
}

export interface MatchFoundMessage {
  type: "match_found";
  match_id: string;
  opponent_account: string;
  opponent_topic: string;
  wager: number;
  game: string;
}

export interface MatchAcceptMessage {
  type: "match_accept";
  match_id: string;
  /** Transaction hash of the wager deposit */
  tx_hash: string;
}

export interface MatchStartMessage {
  type: "match_start";
  match_id: string;
  arena_ws_url: string;
}

export interface MatchResultMessage {
  type: "match_result";
  match_id: string;
  winner: string;
  positions: string[];
  proof_hash: string;
}

export interface ChatMessage {
  type: "chat";
  text: string;
}

// ---------- Union type ----------

export type AgentMessage =
  | QueueJoinMessage
  | MatchFoundMessage
  | MatchAcceptMessage
  | MatchStartMessage
  | MatchResultMessage
  | ChatMessage;

// ---------- Validation ----------

export function validateMessage(raw: unknown): { valid: boolean; message?: AgentMessage; error?: string } {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Message must be a non-null object" };
  }

  const obj = raw as Record<string, unknown>;

  if (!obj.type || typeof obj.type !== "string") {
    return { valid: false, error: "Message must have a string 'type' field" };
  }

  if (!MESSAGE_TYPES.includes(obj.type as MessageType)) {
    return { valid: false, error: `Unknown message type: ${obj.type}` };
  }

  switch (obj.type) {
    case "queue_join":
      if (typeof obj.game !== "string" || !obj.game) return { valid: false, error: "queue_join requires non-empty 'game'" };
      if (typeof obj.wager !== "number" || obj.wager < 0) return { valid: false, error: "queue_join requires non-negative 'wager'" };
      break;

    case "match_found":
      if (typeof obj.match_id !== "string") return { valid: false, error: "match_found requires 'match_id'" };
      if (typeof obj.opponent_account !== "string") return { valid: false, error: "match_found requires 'opponent_account'" };
      if (typeof obj.opponent_topic !== "string") return { valid: false, error: "match_found requires 'opponent_topic'" };
      if (typeof obj.wager !== "number") return { valid: false, error: "match_found requires 'wager'" };
      if (typeof obj.game !== "string") return { valid: false, error: "match_found requires 'game'" };
      break;

    case "match_accept":
      if (typeof obj.match_id !== "string") return { valid: false, error: "match_accept requires 'match_id'" };
      if (typeof obj.tx_hash !== "string") return { valid: false, error: "match_accept requires 'tx_hash'" };
      break;

    case "match_start":
      if (typeof obj.match_id !== "string") return { valid: false, error: "match_start requires 'match_id'" };
      if (typeof obj.arena_ws_url !== "string") return { valid: false, error: "match_start requires 'arena_ws_url'" };
      break;

    case "match_result":
      if (typeof obj.match_id !== "string") return { valid: false, error: "match_result requires 'match_id'" };
      if (typeof obj.winner !== "string") return { valid: false, error: "match_result requires 'winner'" };
      if (!Array.isArray(obj.positions)) return { valid: false, error: "match_result requires 'positions' array" };
      if (typeof obj.proof_hash !== "string") return { valid: false, error: "match_result requires 'proof_hash'" };
      break;

    case "chat":
      if (typeof obj.text !== "string") return { valid: false, error: "chat requires 'text'" };
      break;
  }

  return { valid: true, message: obj as unknown as AgentMessage };
}

/**
 * Try to parse a raw string as a structured AgentMessage.
 * Returns null if the string is not valid JSON or fails validation.
 */
export function parseAgentMessage(raw: string): AgentMessage | null {
  try {
    const parsed = JSON.parse(raw);
    const result = validateMessage(parsed);
    return result.valid ? result.message! : null;
  } catch {
    return null;
  }
}

/**
 * Attempt to infer intent from a natural language chat message.
 * Returns a structured message if intent is detected, otherwise returns
 * a ChatMessage wrapping the original text.
 */
export function parseNaturalLanguage(text: string): AgentMessage {
  const lower = text.toLowerCase().trim();

  // Match "join queue" / "play mario kart" / "i want to play" patterns
  const joinPatterns = [
    /(?:join|enter|queue|play)\s+(?:for\s+)?(?:a\s+)?(?:game\s+(?:of\s+)?)?(.+?)(?:\s+for\s+(\d+))?$/i,
    /i\s+want\s+to\s+play\s+(.+?)(?:\s+for\s+(\d+))?$/i,
    /ready\s+to\s+(?:play|compete)(?:\s+(.+?))?(?:\s+for\s+(\d+))?$/i,
  ];

  for (const pattern of joinPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const game = match[1]?.trim() || "mario-kart-64";
      const wager = match[2] ? parseInt(match[2], 10) : 0;
      return { type: "queue_join", game, wager };
    }
  }

  // Match "accept match <id>" patterns
  const acceptMatch = lower.match(/(?:accept|confirm|yes)\s+(?:match\s+)?([a-zA-Z0-9-]+)?/);
  if (acceptMatch && (lower.includes("match") || lower.includes("accept"))) {
    return { type: "match_accept", match_id: acceptMatch[1] || "pending", tx_hash: "pending" };
  }

  // Default: wrap as chat
  return { type: "chat", text };
}
