/**
 * E2E Integration Test — Steampunk Agent Colosseum
 *
 * Tests the full match pipeline using the Clash of Wits (RPSLS) game adapter.
 * Uses arena REST API directly (MVP path — no matchmaker/HCS-10 dependency).
 *
 * Flow:
 *   1. Register both agents
 *   2. Queue both agents → match created
 *   3. Start match with game_type=clash_of_wits
 *   4. Both agents submit moves for 5 rounds (best-of-5)
 *   5. Verify settlement via GET /agents/matches/{id}
 *   6. Log full results
 *
 * Usage:
 *   cd scripts && npx tsx e2e-test.ts
 *   # or: npm run e2e
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARENA_BASE = process.env.ARENA_URL || "http://localhost:8000";
const MOVES = ["rock", "paper", "scissors", "lizard", "spock"] as const;
type Move = (typeof MOVES)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${step}] ${msg}`);
}

function logError(step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] [${step}] ERROR: ${msg}`);
}

async function api<T = any>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${ARENA_BASE}${endpoint}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(
      `${method} ${endpoint} → ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
    );
  }
  return data as T;
}

function pickMove(round: number, agentIndex: number): Move {
  // Deterministic but varied move selection so rounds actually resolve
  const patterns: Move[][] = [
    ["rock", "spock", "paper", "lizard", "scissors"],
    ["scissors", "rock", "lizard", "spock", "paper"],
  ];
  return patterns[agentIndex][round % patterns[agentIndex].length];
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Steampunk Agent Colosseum — E2E Integration Test");
  console.log("  Arena:", ARENA_BASE);
  console.log("=".repeat(60));
  console.log();

  // ── 0. Health check ───────────────────────────────────────────────
  log("HEALTH", "Checking arena server...");
  try {
    const health = await api("GET", "/health");
    log("HEALTH", `Arena is up: ${JSON.stringify(health)}`);
  } catch (err: any) {
    logError("HEALTH", `Arena unreachable at ${ARENA_BASE} — ${err.message}`);
    logError("HEALTH", "Start arena with: cd arena && uvicorn arena.main:app --reload");
    process.exit(1);
  }

  // ── 1. Load agent config ──────────────────────────────────────────
  log("SETUP", "Loading agent config from agent-ids.json...");
  const agentIdsPath = path.join(__dirname, "agent-ids.json");
  if (!fs.existsSync(agentIdsPath)) {
    logError("SETUP", `agent-ids.json not found at ${agentIdsPath}`);
    process.exit(1);
  }
  const agentConfig = JSON.parse(fs.readFileSync(agentIdsPath, "utf-8"));
  const agents = agentConfig.agents;

  // Use inbound topic IDs as agent addresses (unique identifiers for each agent)
  const agentA = {
    address: agents[0].inboundTopicId.replace(/\./g, "").padStart(40, "0"),
    name: agents[0].name,
    topicId: agents[0].inboundTopicId,
  };
  const agentB = {
    address: agents[1].inboundTopicId.replace(/\./g, "").padStart(40, "0"),
    name: agents[1].name,
    topicId: agents[1].inboundTopicId,
  };

  log("SETUP", `Agent A: ${agentA.name} (${agentA.address})`);
  log("SETUP", `Agent B: ${agentB.name} (${agentB.address})`);

  // ── 2. Register agents ────────────────────────────────────────────
  log("REGISTER", `Registering ${agentA.name}...`);
  const regA = await api("POST", "/agents/register", {
    address: agentA.address,
    name: agentA.name,
    model_name: "e2e-test-bot",
    owner_wallet: agentA.address,
    hcs_topic_id: agentA.topicId,
  });
  log("REGISTER", `${agentA.name}: ${regA.status} (elo: ${regA.elo})`);

  log("REGISTER", `Registering ${agentB.name}...`);
  const regB = await api("POST", "/agents/register", {
    address: agentB.address,
    name: agentB.name,
    model_name: "e2e-test-bot",
    owner_wallet: agentB.address,
    hcs_topic_id: agentB.topicId,
  });
  log("REGISTER", `${agentB.name}: ${regB.status} (elo: ${regB.elo})`);

  // ── 3. Queue both agents → match creation ─────────────────────────
  log("QUEUE", `${agentA.name} joining queue...`);
  const queueA = await api("POST", "/agents/matches/queue", {
    agent_address: agentA.address,
    wager_amount: 10.0,
  });
  log("QUEUE", `${agentA.name}: ${queueA.status}`);

  log("QUEUE", `${agentB.name} joining queue...`);
  const queueB = await api("POST", "/agents/matches/queue", {
    agent_address: agentB.address,
    wager_amount: 10.0,
  });
  log("QUEUE", `${agentB.name}: ${queueB.status}`);

  if (queueB.status !== "matched") {
    logError("QUEUE", `Expected 'matched', got '${queueB.status}'. Match was not created.`);
    process.exit(1);
  }

  const matchId = queueB.match_id;
  const matchAgents = queueB.agents as string[];
  log("QUEUE", `Match created: ${matchId}`);
  log("QUEUE", `Agents in match: ${matchAgents.join(", ")}`);
  log("QUEUE", `Wager: ${queueB.wager_amount} STEAM`);

  // ── 4. Start match (clash_of_wits) ────────────────────────────────
  log("START", "Starting match with game_type=clash_of_wits...");
  const startResult = await api(
    "POST",
    `/matches/${matchId}/start?game_type=clash_of_wits`,
  );
  log("START", `Match starting: ${JSON.stringify(startResult)}`);

  // Give the adapter a moment to initialize
  await sleep(500);

  // ── 5. Play rounds ────────────────────────────────────────────────
  const MAX_ROUNDS = 9; // best-of-5 can take up to 9 rounds with draws
  let matchFinished = false;
  let roundResults: any[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const moveA = pickMove(round, 0);
    const moveB = pickMove(round, 1);

    log("ROUND", `--- Round ${round + 1} ---`);
    log("ROUND", `${agentA.name} plays: ${moveA}`);

    // Agent A submits move
    const resA = await api(
      "POST",
      `/matches/${matchId}/action?agent_id=${matchAgents[0]}&action=${moveA}`,
    );
    log("ROUND", `${agentA.name} response: ${resA.status} — ${resA.message || ""}`);

    log("ROUND", `${agentB.name} plays: ${moveB}`);

    // Agent B submits move — this triggers round resolution
    const resB = await api(
      "POST",
      `/matches/${matchId}/action?agent_id=${matchAgents[1]}&action=${moveB}`,
    );

    if (resB.status === "round_resolved") {
      const winner = resB.result;
      const scores = resB.scores;
      log(
        "ROUND",
        `Result: ${winner} | Scores: ${JSON.stringify(scores)}`,
      );
      roundResults.push({
        round: resB.round,
        moves: resB.moves,
        result: resB.result,
        scores: resB.scores,
      });

      if (resB.match_status === "finished") {
        log("ROUND", "Match finished!");
        matchFinished = true;
        break;
      }
    } else {
      log("ROUND", `Unexpected response: ${JSON.stringify(resB)}`);
    }

    // Small delay between rounds
    await sleep(200);
  }

  if (!matchFinished) {
    logError("GAME", `Match did not finish after ${MAX_ROUNDS} rounds`);
    process.exit(1);
  }

  // ── 6. Wait for settlement to complete ────────────────────────────
  log("SETTLE", "Waiting for settlement pipeline...");
  let settled = false;
  const SETTLE_TIMEOUT_MS = 30_000;
  const POLL_INTERVAL_MS = 1_000;
  const settleStart = Date.now();

  while (Date.now() - settleStart < SETTLE_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const matchData = await api("GET", `/agents/matches/${matchId}`);
      log("SETTLE", `Match status: ${matchData.status}`);

      if (matchData.status === "settled") {
        settled = true;
        log("SETTLE", `Winner: ${matchData.winner}`);
        log("SETTLE", `HCS message ID: ${matchData.hcs_message_id || "none"}`);
        break;
      }
    } catch (err: any) {
      log("SETTLE", `Poll error: ${err.message}`);
    }
  }

  if (!settled) {
    logError("SETTLE", "Match did not settle within timeout — settlement pipeline may have issues");
    logError("SETTLE", "This could be due to missing env vars (ARENA_PRIVATE_KEY, contract addresses)");
    logError("SETTLE", "The game logic still completed successfully.");
  }

  // ── 7. Final report ───────────────────────────────────────────────
  console.log();
  console.log("=".repeat(60));
  console.log("  E2E Test Results");
  console.log("=".repeat(60));
  console.log();
  console.log("Match ID:", matchId);
  console.log("Game:", "Clash of Wits (RPSLS)");
  console.log("Agents:", matchAgents.join(" vs "));
  console.log("Settlement:", settled ? "OK" : "INCOMPLETE (on-chain may be skipped)");
  console.log();
  console.log("Round-by-round:");
  for (const r of roundResults) {
    const moveEntries = Object.entries(r.moves as Record<string, string>);
    const moveStr = moveEntries
      .map(([addr, move]) => `${addr.slice(0, 10)}...=${move}`)
      .join(" vs ");
    console.log(`  Round ${r.round}: ${moveStr} → ${r.result}`);
  }
  console.log();
  if (roundResults.length > 0) {
    const finalScores = roundResults[roundResults.length - 1].scores;
    console.log("Final scores:", JSON.stringify(finalScores, null, 2));
  }

  // ── 8. Check leaderboard ──────────────────────────────────────────
  try {
    const leaderboard = await api("GET", "/agents/leaderboard");
    console.log();
    console.log("Leaderboard (post-match):");
    for (const entry of leaderboard) {
      console.log(
        `  ${entry.name}: ELO ${entry.elo} | W:${entry.wins} L:${entry.losses} | Played: ${entry.matches_played}`,
      );
    }
  } catch {
    log("LEADERBOARD", "Could not fetch leaderboard");
  }

  console.log();
  console.log("=".repeat(60));
  console.log(settled ? "  ALL CHECKS PASSED" : "  GAME PASSED — SETTLEMENT INCOMPLETE");
  console.log("=".repeat(60));

  process.exit(settled ? 0 : 2);
}

main().catch((err) => {
  logError("FATAL", err.message);
  console.error(err);
  process.exit(1);
});
