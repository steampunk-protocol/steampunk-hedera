/**
 * matchmaker.ts — Matchmaker Agent Service
 *
 * Runs as an HCS-10 agent, polls its inbound topic for connection requests,
 * accepts them, listens on connection topics for queue_join messages, pairs
 * agents in FIFO order, and notifies both agents of match_found.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import { HCS10AgentClient } from "./hcs10_client.js";
import {
  parseAgentMessage,
  parseNaturalLanguage,
  type AgentMessage,
  type QueueJoinMessage,
  type MatchAcceptMessage,
} from "./types.js";

// ---------- Config ----------

import { readFileSync } from "fs";

// Load matchmaker agent credentials from agent-ids.json
const agentIdsPath = resolve(__dirname, "../scripts/agent-ids.json");
const agentIds = JSON.parse(readFileSync(agentIdsPath, "utf-8"));
const matchmakerAgent = agentIds.agents.find((a: any) => a.name === "Matchmaker");

if (!matchmakerAgent?.accountId || !matchmakerAgent?.privateKey) {
  console.error("Matchmaker agent not found in agent-ids.json. Run: npx tsx scripts/register-agents.ts");
  process.exit(1);
}

const OPERATOR_ID = matchmakerAgent.accountId;
const OPERATOR_KEY = matchmakerAgent.privateKey;
const NETWORK = (process.env.HEDERA_NETWORK ?? "testnet") as "testnet" | "mainnet";
const MATCHMAKER_INBOUND = matchmakerAgent.inboundTopicId;
const ARENA_BASE_URL = process.env.ARENA_BASE_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 3000;

// ---------- State ----------

interface ConnectedAgent {
  accountId: string;
  connectionTopicId: string;
  lastSeen: string;
}

interface QueueEntry {
  accountId: string;
  connectionTopicId: string;
  game: string;
  wager: number;
  joinedAt: number;
}

interface PendingMatch {
  matchId: string;
  game: string;
  wager: number;
  agents: [QueueEntry, QueueEntry];
  acceptedBy: Set<string>;
  createdAt: number;
}

const connections = new Map<string, ConnectedAgent>(); // accountId -> ConnectedAgent
const connectionTopics = new Map<string, string>(); // connectionTopicId -> accountId
const matchQueue: QueueEntry[] = [];
const pendingMatches = new Map<string, PendingMatch>(); // matchId -> PendingMatch
let lastInboundTimestamp = "";
const lastConnectionTimestamps = new Map<string, string>(); // topicId -> last ts

// ---------- Client ----------

const client = new HCS10AgentClient({
  operatorId: OPERATOR_ID,
  operatorKey: OPERATOR_KEY,
  network: NETWORK,
});

// ---------- Logging ----------

function log(category: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${category}]`, ...args);
}

// ---------- Inbound topic polling (connection requests) ----------

async function pollInboundTopic() {
  try {
    const requests = await client.pollInbound(MATCHMAKER_INBOUND, lastInboundTimestamp);

    for (const req of requests) {
      log("INBOUND", `Connection request from ${req.requestorAccountId} (seq=${req.requestId})`);

      // Skip if already connected
      if (connections.has(req.requestorAccountId)) {
        log("INBOUND", `Already connected to ${req.requestorAccountId}, skipping`);
        continue;
      }

      try {
        const connectionTopicId = await client.acceptConnection(
          MATCHMAKER_INBOUND,
          req.requestorAccountId,
          req.requestId,
        );

        log("INBOUND", `Accepted connection → topic ${connectionTopicId}`);

        connections.set(req.requestorAccountId, {
          accountId: req.requestorAccountId,
          connectionTopicId,
          lastSeen: req.timestamp,
        });
        connectionTopics.set(connectionTopicId, req.requestorAccountId);
        lastConnectionTimestamps.set(connectionTopicId, "");

        // Send welcome message
        await client.sendMessage(connectionTopicId, {
          type: "chat",
          text: `Welcome to Agent Colosseum! Send { "type": "queue_join", "game": "mario-kart-64", "wager": 100 } to enter the queue. Or just say "play mario kart".`,
        });
      } catch (err) {
        log("ERROR", `Failed to accept connection from ${req.requestorAccountId}:`, err);
      }

      // Update watermark
      if (req.timestamp > lastInboundTimestamp) {
        lastInboundTimestamp = req.timestamp;
      }
    }
  } catch (err) {
    log("ERROR", "Failed to poll inbound topic:", err);
  }
}

// ---------- Connection topic polling (agent messages) ----------

async function pollConnectionTopics() {
  for (const [topicId, accountId] of connectionTopics.entries()) {
    try {
      const since = lastConnectionTimestamps.get(topicId) ?? "";
      const messages = await client.getMessages(topicId, since);

      for (const msg of messages) {
        // Skip our own messages
        if (msg.payer === OPERATOR_ID) continue;
        // Only process "message" ops (not connection_created, etc.)
        if (msg.op !== "message") continue;

        log("MSG", `[${accountId}] op=${msg.op} data=${msg.data.slice(0, 120)}`);

        // Try to parse as structured AgentMessage
        let agentMsg = parseAgentMessage(msg.data);

        // If not valid JSON, try natural language parsing (HOL requirement)
        if (!agentMsg) {
          log("NLP", `Parsing natural language: "${msg.data.slice(0, 80)}"`);
          agentMsg = parseNaturalLanguage(msg.data);
        }

        await handleAgentMessage(accountId, topicId, agentMsg);

        // Update watermark
        if (msg.timestamp > (lastConnectionTimestamps.get(topicId) ?? "")) {
          lastConnectionTimestamps.set(topicId, msg.timestamp);
        }
      }
    } catch (err) {
      log("ERROR", `Failed to poll connection topic ${topicId}:`, err);
    }
  }
}

// ---------- Message handlers ----------

async function handleAgentMessage(accountId: string, connectionTopicId: string, msg: AgentMessage) {
  switch (msg.type) {
    case "queue_join":
      await handleQueueJoin(accountId, connectionTopicId, msg);
      break;
    case "match_accept":
      await handleMatchAccept(accountId, msg);
      break;
    case "chat":
      log("CHAT", `[${accountId}]: ${msg.text}`);
      // Acknowledge
      await client.sendMessage(connectionTopicId, {
        type: "chat",
        text: `Received your message. To join a match, send a queue_join message or say "play mario kart".`,
      });
      break;
    default:
      log("WARN", `Unexpected message type from agent: ${(msg as any).type}`);
  }
}

async function handleQueueJoin(accountId: string, connectionTopicId: string, msg: QueueJoinMessage) {
  // Check if already in queue
  const existing = matchQueue.find((e) => e.accountId === accountId);
  if (existing) {
    log("QUEUE", `${accountId} already in queue, updating`);
    existing.game = msg.game;
    existing.wager = msg.wager;
    await client.sendMessage(connectionTopicId, {
      type: "chat",
      text: `Updated your queue entry: game=${msg.game}, wager=${msg.wager}. Waiting for opponent...`,
    });
    return;
  }

  const entry: QueueEntry = {
    accountId,
    connectionTopicId,
    game: msg.game,
    wager: msg.wager,
    joinedAt: Date.now(),
  };
  matchQueue.push(entry);
  log("QUEUE", `${accountId} joined queue: game=${msg.game} wager=${msg.wager} (queue size: ${matchQueue.length})`);

  await client.sendMessage(connectionTopicId, {
    type: "chat",
    text: `You're in the queue for ${msg.game} with wager ${msg.wager} STEAM. Waiting for opponent...`,
  });

  // Try to match
  await tryMatch();
}

async function tryMatch() {
  if (matchQueue.length < 2) return;

  // Simple FIFO: pair first two entries with matching game
  for (let i = 0; i < matchQueue.length; i++) {
    for (let j = i + 1; j < matchQueue.length; j++) {
      const a = matchQueue[i];
      const b = matchQueue[j];

      if (a.game !== b.game) continue;

      // Use the lower wager for the match
      const wager = Math.min(a.wager, b.wager);

      // Remove both from queue
      matchQueue.splice(j, 1);
      matchQueue.splice(i, 1);

      const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      log("MATCH", `Paired ${a.accountId} vs ${b.accountId} → ${matchId}`);

      const pending: PendingMatch = {
        matchId,
        game: a.game,
        wager,
        agents: [a, b],
        acceptedBy: new Set(),
        createdAt: Date.now(),
      };
      pendingMatches.set(matchId, pending);

      // Notify both agents
      const matchFoundA = {
        type: "match_found" as const,
        match_id: matchId,
        opponent_account: b.accountId,
        opponent_topic: b.connectionTopicId,
        wager,
        game: a.game,
      };

      const matchFoundB = {
        type: "match_found" as const,
        match_id: matchId,
        opponent_account: a.accountId,
        opponent_topic: a.connectionTopicId,
        wager,
        game: a.game,
      };

      await client.sendMessage(a.connectionTopicId, matchFoundA);
      await client.sendMessage(b.connectionTopicId, matchFoundB);

      log("MATCH", `Notified both agents of match ${matchId}`);
      return; // One match per cycle
    }
  }
}

async function handleMatchAccept(accountId: string, msg: MatchAcceptMessage) {
  const pending = pendingMatches.get(msg.match_id);
  if (!pending) {
    log("WARN", `${accountId} accepted unknown match ${msg.match_id}`);
    return;
  }

  pending.acceptedBy.add(accountId);
  log("MATCH", `${accountId} accepted match ${msg.match_id} (${pending.acceptedBy.size}/2)`);

  // Both agents accepted — start the match
  if (pending.acceptedBy.size >= 2) {
    log("MATCH", `Both agents accepted match ${msg.match_id}, starting!`);

    // Call arena API to start match
    try {
      const arenaResponse = await fetch(`${ARENA_BASE_URL}/matches/${msg.match_id}/start?game_type=clash_of_wits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: msg.match_id,
          game: pending.game,
          wager: pending.wager,
          agents: pending.agents.map((a) => ({
            account_id: a.accountId,
            connection_topic: a.connectionTopicId,
          })),
        }),
      });

      if (!arenaResponse.ok) {
        log("WARN", `Arena API returned ${arenaResponse.status} for match start`);
      }
    } catch (err) {
      log("WARN", `Arena API unreachable (non-blocking):`, err);
    }

    // Send match_start to both agents
    const wsUrl = `ws://${ARENA_BASE_URL.replace(/^https?:\/\//, "")}/matches/${msg.match_id}/stream`;
    for (const agent of pending.agents) {
      await client.sendMessage(agent.connectionTopicId, {
        type: "match_start" as const,
        match_id: msg.match_id,
        arena_ws_url: wsUrl,
      });
    }

    pendingMatches.delete(msg.match_id);
  }
}

// ---------- Main loop ----------

async function main() {
  log("BOOT", `Matchmaker starting on ${NETWORK}`);
  log("BOOT", `Operator: ${OPERATOR_ID}`);
  log("BOOT", `Inbound topic: ${MATCHMAKER_INBOUND}`);
  log("BOOT", `Arena URL: ${ARENA_BASE_URL}`);
  log("BOOT", `Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Main polling loop
  while (true) {
    await pollInboundTopic();
    await pollConnectionTopics();

    // Clean up stale pending matches (>5 min)
    const now = Date.now();
    for (const [matchId, pending] of pendingMatches.entries()) {
      if (now - pending.createdAt > 5 * 60 * 1000) {
        log("CLEANUP", `Removing stale match ${matchId}`);
        pendingMatches.delete(matchId);
        // Return agents to queue
        for (const agent of pending.agents) {
          if (!pending.acceptedBy.has(agent.accountId)) {
            matchQueue.push(agent);
          }
        }
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Matchmaker fatal error:", err);
  process.exit(1);
});
