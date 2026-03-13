/**
 * Agent Autonomy Loop
 *
 * Autonomous agent runner that monitors HCS-10 inbound topic for match
 * invitations, auto-accepts connections, joins matchmaking queue, deposits
 * wagers, plays games via WebSocket, and loops forever seeking the next match.
 *
 * Usage:
 *   tsx loop.ts --agent mario
 *   tsx loop.ts --agent luigi
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { ethers } from "ethers";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import { HCS10AgentClient } from "./hcs10_client.js";
import {
  parseAgentMessage,
  type QueueJoinMessage,
  type MatchFoundMessage,
  type MatchAcceptMessage,
  type MatchStartMessage,
  type MatchResultMessage,
  type AgentMessage,
} from "./types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HEDERA_RPC = process.env.HEDERA_TESTNET_RPC || "https://testnet.hashio.io/api";
const STEAM_TOKEN_ADDRESS = process.env.STEAM_TOKEN_EVM_ADDRESS || "0x00000000000000000000000000000000007ced23";
const WAGER_CONTRACT_ADDRESS = process.env.WAGER_CONTRACT_ADDRESS || "";
const ARENA_BASE_URL = process.env.ARENA_BASE_URL || "http://localhost:8000";
// These get overridden per-agent from agent-ids.json in runAutonomyLoop()
let OPERATOR_KEY = (process.env.HEDERA_OPERATOR_KEY || "").replace(/^0x/, "");
let OPERATOR_ID = process.env.HEDERA_OPERATOR_ID || "";
let MATCHMAKER_TOPIC = process.env.HCS_MATCHMAKER_TOPIC || "0.0.8205003";

const POLL_INTERVAL_MS = 3_000;
const STEAM_DECIMALS = 8;
const DEFAULT_WAGER = 100; // 100 STEAM tokens (human-readable)
const DEFAULT_GAME = "mario-kart-64";
const QUEUE_TIMEOUT_MS = 30_000;

// Minimal ERC-20 ABI for approve
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

// ---------------------------------------------------------------------------
// Agent config loader
// ---------------------------------------------------------------------------

interface AgentConfig {
  name: string;
  accountId?: string;
  privateKey?: string;
  inboundTopicId: string;
  outboundTopicId?: string;
  profileTopicId: string;
  capabilities: string[];
}

function loadAgentConfig(agentName: string): AgentConfig {
  const idsPath = resolve(__dirname, "../scripts/agent-ids.json");
  const raw = JSON.parse(readFileSync(idsPath, "utf-8"));
  const agents: AgentConfig[] = raw.agents;
  const match = agents.find(
    (a) => a.name.toLowerCase().replace("agent", "") === agentName.toLowerCase(),
  );
  if (!match) {
    const available = agents.map((a) => a.name).join(", ");
    throw new Error(`Agent "${agentName}" not found. Available: ${available}`);
  }

  // Also load the matchmaker inbound topic
  const matchmaker = agents.find((a: any) => a.name === "Matchmaker");
  if (matchmaker) {
    MATCHMAKER_TOPIC = matchmaker.inboundTopicId;
  }

  // Override operator credentials if agent has its own account
  if (match.accountId && match.privateKey) {
    OPERATOR_ID = match.accountId;
    OPERATOR_KEY = match.privateKey;
  }

  return match;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { agentName: string } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--agent");
  if (idx === -1 || idx + 1 >= args.length) {
    console.error("Usage: tsx loop.ts --agent <mario|luigi>");
    process.exit(1);
  }
  return { agentName: args[idx + 1] };
}

// ---------------------------------------------------------------------------
// Game strategy
// ---------------------------------------------------------------------------

/** Simple MK64 rule-based strategy: always accelerate, steer toward center. */
function mk64Action(_gameState: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "agent_action",
    accelerate: true,
    brake: false,
    steer: 0, // 0 = straight, negative = left, positive = right
    use_item: false,
    drift: false,
  };
}

/**
 * RPSLS weighted random strategy based on opponent history.
 * Tracks opponent's last moves and counter-picks with slight bias.
 */
const RPSLS_MOVES = ["rock", "paper", "scissors", "lizard", "spock"] as const;
const RPSLS_BEATS: Record<string, string[]> = {
  rock: ["scissors", "lizard"],
  paper: ["rock", "spock"],
  scissors: ["paper", "lizard"],
  lizard: ["paper", "spock"],
  spock: ["rock", "scissors"],
};

function rpslsAction(
  _gameState: Record<string, unknown>,
  opponentHistory: string[],
): Record<string, unknown> {
  if (opponentHistory.length === 0) {
    const move = RPSLS_MOVES[Math.floor(Math.random() * RPSLS_MOVES.length)];
    return { type: "agent_action", move };
  }

  // Count opponent move frequency
  const freq: Record<string, number> = {};
  for (const m of opponentHistory) {
    freq[m] = (freq[m] || 0) + 1;
  }

  // Find opponent's most common move
  let maxCount = 0;
  let opponentFav = opponentHistory[opponentHistory.length - 1];
  for (const [move, count] of Object.entries(freq)) {
    if (count > maxCount) {
      maxCount = count;
      opponentFav = move;
    }
  }

  // Pick a move that beats opponent's favorite
  const counters = RPSLS_MOVES.filter(
    (m) => RPSLS_BEATS[m]?.includes(opponentFav),
  );
  const move =
    counters.length > 0
      ? counters[Math.floor(Math.random() * counters.length)]
      : RPSLS_MOVES[Math.floor(Math.random() * RPSLS_MOVES.length)];

  return { type: "agent_action", move };
}

// ---------------------------------------------------------------------------
// WebSocket game player
// ---------------------------------------------------------------------------

async function playGame(
  wsUrl: string,
  matchId: string,
  agentName: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolveGame, rejectGame) => {
    const opponentHistory: string[] = [];
    let gameType: "mk64" | "rpsls" = "mk64";

    const ws = new WebSocket(wsUrl);
    let resolved = false;

    const cleanup = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    ws.on("open", () => {
      console.log(`[${agentName}] Connected to arena WS: ${wsUrl}`);
      ws.send(JSON.stringify({ type: "agent_join", agent_name: agentName, match_id: matchId }));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "race_start" || msg.type === "match_config") {
          gameType = msg.game_type === "rpsls" ? "rpsls" : "mk64";
          console.log(`[${agentName}] Game started: type=${gameType}, match=${matchId}`);
        }

        if (msg.type === "race_tick" || msg.type === "game_state") {
          if (msg.opponent_move) {
            opponentHistory.push(msg.opponent_move);
          }
          const action =
            gameType === "rpsls"
              ? rpslsAction(msg, opponentHistory)
              : mk64Action(msg);
          ws.send(JSON.stringify(action));
        }

        if (msg.type === "race_end" || msg.type === "match_result" || msg.type === "game_over") {
          console.log(`[${agentName}] Game ended: ${JSON.stringify(msg)}`);
          resolved = true;
          cleanup();
          resolveGame(msg);
        }

        if (msg.type === "keepalive") {
          ws.send("ping");
        }
      } catch (err) {
        console.error(`[${agentName}] WS message parse error:`, err);
      }
    });

    ws.on("error", (err) => {
      console.error(`[${agentName}] WS error:`, err);
      if (!resolved) {
        resolved = true;
        cleanup();
        rejectGame(err);
      }
    });

    ws.on("close", () => {
      console.log(`[${agentName}] WS connection closed`);
      if (!resolved) {
        resolved = true;
        resolveGame({ type: "ws_closed", match_id: matchId });
      }
    });

    // Timeout: 5 minutes max per game
    setTimeout(() => {
      if (!resolved) {
        console.warn(`[${agentName}] Game timed out after 5 minutes`);
        resolved = true;
        cleanup();
        resolveGame({ type: "timeout", match_id: matchId });
      }
    }, 5 * 60 * 1000);
  });
}

// ---------------------------------------------------------------------------
// On-chain wager deposit
// ---------------------------------------------------------------------------

async function approveAndDepositWager(
  matchId: bigint,
  wagerAmountRaw: bigint,
  privateKey: string,
): Promise<string> {
  if (!WAGER_CONTRACT_ADDRESS) {
    console.warn("WAGER_CONTRACT_ADDRESS not set, skipping on-chain deposit");
    return "";
  }

  const provider = new ethers.JsonRpcProvider(HEDERA_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const steamToken = new ethers.Contract(STEAM_TOKEN_ADDRESS, ERC20_ABI, wallet);

  // Check current allowance
  const currentAllowance = await steamToken.allowance(wallet.address, WAGER_CONTRACT_ADDRESS);
  if (currentAllowance < wagerAmountRaw) {
    console.log(`Approving ${wagerAmountRaw} STEAM to Wager contract...`);
    const approveTx = await steamToken.approve(WAGER_CONTRACT_ADDRESS, wagerAmountRaw);
    await approveTx.wait();
    console.log(`Approval confirmed: ${approveTx.hash}`);
  }

  // Deposit to Wager contract
  const wagerAbi = [
    "function deposit(uint256 matchId) external",
    "function deposited(uint256 matchId, address agent) external view returns (bool)",
  ];
  const wagerContract = new ethers.Contract(WAGER_CONTRACT_ADDRESS, wagerAbi, wallet);

  const alreadyDeposited = await wagerContract.deposited(matchId, wallet.address);
  if (alreadyDeposited) {
    console.log(`Already deposited for match ${matchId}`);
    return "already_deposited";
  }

  console.log(`Depositing wager for match ${matchId}...`);
  const depositTx = await wagerContract.deposit(matchId);
  await depositTx.wait();
  console.log(`Wager deposited: ${depositTx.hash}`);
  return depositTx.hash;
}

// ---------------------------------------------------------------------------
// Arena HTTP helpers
// ---------------------------------------------------------------------------

async function registerWithArena(
  agentAddress: string,
  agentName: string,
  hcsTopicId: string,
): Promise<void> {
  try {
    const res = await fetch(`${ARENA_BASE_URL}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: agentAddress,
        name: agentName,
        model_name: "autonomous-agent",
        owner_wallet: agentAddress,
        hcs_topic_id: hcsTopicId,
      }),
    });
    const data = await res.json();
    console.log(`Arena registration: ${JSON.stringify(data)}`);
  } catch (err) {
    console.warn(`Arena registration failed (non-fatal):`, err);
  }
}

async function joinArenaQueue(
  agentAddress: string,
  wagerAmount: number = DEFAULT_WAGER,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${ARENA_BASE_URL}/agents/matches/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_address: agentAddress,
        wager_amount: wagerAmount,
      }),
    });
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn(`Queue join failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main autonomy loop
// ---------------------------------------------------------------------------

type AgentState = "idle" | "queued" | "matched" | "depositing" | "playing" | "cooldown";

async function runAutonomyLoop(agentName: string): Promise<void> {
  const agentConfig = loadAgentConfig(agentName);
  console.log(`\n=== Agent Autonomy Loop ===`);
  console.log(`Agent    : ${agentConfig.name}`);
  console.log(`Inbound  : ${agentConfig.inboundTopicId}`);
  console.log(`Profile  : ${agentConfig.profileTopicId}`);
  console.log(`Matchmaker: ${MATCHMAKER_TOPIC}`);
  console.log(`Arena    : ${ARENA_BASE_URL}`);
  console.log(`RPC      : ${HEDERA_RPC}`);
  console.log(`Wager    : ${WAGER_CONTRACT_ADDRESS}`);
  console.log(`STEAM    : ${STEAM_TOKEN_ADDRESS}`);
  console.log();

  if (!OPERATOR_KEY) {
    throw new Error("Agent key is required (from agent-ids.json or HEDERA_OPERATOR_KEY)");
  }

  // ED25519 DER keys (from agent registration) can't be used with ethers.Wallet.
  // Only create wallet if key is ECDSA hex (for on-chain wager deposits).
  let wallet: ethers.Wallet | null = null;
  let agentAddress: string;
  const isEcdsaKey = !OPERATOR_KEY.startsWith("302e") && OPERATOR_KEY.length === 64;
  if (isEcdsaKey) {
    const pk = OPERATOR_KEY.startsWith("0x") ? OPERATOR_KEY : `0x${OPERATOR_KEY}`;
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC);
    wallet = new ethers.Wallet(pk, provider);
    agentAddress = wallet.address.toLowerCase();
  } else {
    // Use accountId-derived EVM address for ED25519 agents
    agentAddress = OPERATOR_ID.replace(/\./g, "").padStart(40, "0");
  }

  console.log(`Wallet   : ${agentAddress}${wallet ? "" : " (HCS-10 only, no EVM wallet)"}`);

  // Initialize HCS-10 client
  const hcsClient = new HCS10AgentClient({
    operatorId: OPERATOR_ID,
    operatorKey: OPERATOR_KEY,
    network: "testnet",
  });

  // Register with arena REST API
  await registerWithArena(agentAddress, agentConfig.name, agentConfig.inboundTopicId);

  let state: AgentState = "idle";
  let currentMatchId: string | null = null;
  let connectionTopicId: string | null = null;
  let matchmakerRequestId: number | null = null;
  let matchCount = 0;
  let lastPollTimestamp: string | undefined;
  let queuedAt = 0;

  // Request connection to matchmaker on startup
  console.log(`Requesting connection to matchmaker topic ${MATCHMAKER_TOPIC}...`);
  try {
    const connResult = await hcsClient.requestConnection(
      MATCHMAKER_TOPIC,
      `${agentConfig.name} requesting to join`,
    );
    matchmakerRequestId = connResult.requestId;
    console.log(`Connection request sent, requestId=${matchmakerRequestId}`);
  } catch (err) {
    console.warn(`Matchmaker connection request failed (will use REST fallback):`, err);
  }

  // Wait for connection confirmation if we sent a request
  if (matchmakerRequestId !== null) {
    try {
      console.log(`Waiting for matchmaker to accept connection...`);
      const connTopicId = await hcsClient.waitForConnectionConfirmation(
        agentConfig.inboundTopicId,
        matchmakerRequestId,
        10,
        3000,
      );
      connectionTopicId = connTopicId;
      console.log(`Connection established! Topic: ${connectionTopicId}`);
    } catch (err) {
      console.warn(`Connection confirmation timed out (will use REST fallback):`, err);
    }
  }

  console.log(`\nStarting autonomy loop...\n`);

  while (true) {
    try {
      // ── Step 1: Poll inbound topic for new connection requests ──
      const connectionRequests = await hcsClient.pollInbound(
        agentConfig.inboundTopicId,
        lastPollTimestamp,
      );

      for (const req of connectionRequests) {
        console.log(`[${agentConfig.name}] Connection request from: ${req.requestorAccountId}`);
        try {
          const connTopic = await hcsClient.acceptConnection(
            agentConfig.inboundTopicId,
            req.requestorAccountId,
            req.requestId,
          );
          connectionTopicId = connTopic;
          lastPollTimestamp = req.timestamp;
          console.log(`[${agentConfig.name}] Connection accepted, topic: ${connTopic}`);
        } catch (err) {
          console.error(`[${agentConfig.name}] Failed to accept connection:`, err);
        }
      }

      // Update poll timestamp even if no requests found
      if (connectionRequests.length > 0) {
        lastPollTimestamp = connectionRequests[connectionRequests.length - 1].timestamp;
      }

      // ── Step 2: Poll connection topic for match messages ──
      if (connectionTopicId && state !== "playing") {
        const messages = await hcsClient.getMessages(connectionTopicId, lastPollTimestamp);

        for (const raw of messages) {
          const parsed = parseAgentMessage(raw.data);
          if (!parsed) continue;

          // Handle match_found
          if (parsed.type === "match_found") {
            currentMatchId = parsed.match_id;
            const wagerAmount = parsed.wager || DEFAULT_WAGER;
            const wagerAmountRaw = BigInt(Math.round(wagerAmount * 10 ** STEAM_DECIMALS));

            console.log(
              `[${agentConfig.name}] Match found! id=${currentMatchId}, ` +
                `wager=${wagerAmount} STEAM, opponent=${parsed.opponent_account}`,
            );

            state = "depositing";

            // Approve + deposit wager on-chain
            // Use match_id hash as numeric ID (arena uses match_id_to_uint256)
            let txHash = "";
            try {
              const numericId = matchIdToUint256(currentMatchId);
              txHash = await approveAndDepositWager(numericId, wagerAmountRaw, privateKey);
              console.log(`[${agentConfig.name}] Wager deposited: ${txHash}`);
            } catch (err) {
              console.error(`[${agentConfig.name}] Wager deposit failed:`, err);
            }

            state = "matched";

            // Send match_accept back to matchmaker
            const acceptMsg: MatchAcceptMessage = {
              type: "match_accept",
              match_id: currentMatchId,
              tx_hash: txHash || "pending",
            };
            await hcsClient.sendMessage(connectionTopicId, acceptMsg);
            console.log(`[${agentConfig.name}] Sent match_accept`);
          }

          // Handle match_start — connect to arena WS and play
          if (parsed.type === "match_start" && currentMatchId) {
            const wsUrl = parsed.arena_ws_url ||
              `${ARENA_BASE_URL.replace("http", "ws")}/matches/${currentMatchId}/stream`;

            console.log(`[${agentConfig.name}] Match starting! Connecting to: ${wsUrl}`);
            state = "playing";

            try {
              const result = await playGame(wsUrl, currentMatchId, agentConfig.name);
              console.log(`[${agentConfig.name}] Game complete:`, JSON.stringify(result));
            } catch (err) {
              console.error(`[${agentConfig.name}] Game play error:`, err);
            }

            matchCount++;
            console.log(`[${agentConfig.name}] Matches completed: ${matchCount}`);

            state = "cooldown";
            currentMatchId = null;
            await sleep(2_000);
            state = "idle";
          }

          // Handle match_result (informational)
          if (parsed.type === "match_result") {
            console.log(
              `[${agentConfig.name}] Match result: ` +
                `winner=${parsed.winner}, match=${parsed.match_id}`,
            );
          }
        }
      }

      // ── Step 3: If idle, join matchmaking queue ──
      if (state === "idle") {
        if (connectionTopicId) {
          // Send queue_join via HCS-10
          const queueMsg: QueueJoinMessage = {
            type: "queue_join",
            game: DEFAULT_GAME,
            wager: DEFAULT_WAGER,
          };
          await hcsClient.sendMessage(connectionTopicId, queueMsg);
          console.log(`[${agentConfig.name}] Sent queue_join via HCS-10`);
          state = "queued";
          queuedAt = Date.now();
        } else {
          // Fallback: join via REST API
          const queueResult = await joinArenaQueue(agentAddress, DEFAULT_WAGER);
          if (queueResult) {
            console.log(`[${agentConfig.name}] Queue result: ${JSON.stringify(queueResult)}`);
            if (queueResult.status === "matched") {
              currentMatchId = queueResult.match_id as string;
              state = "matched";

              // Deposit wager
              const wagerAmount = (queueResult.wager_amount as number) || DEFAULT_WAGER;
              const wagerAmountRaw = BigInt(Math.round(wagerAmount * 10 ** STEAM_DECIMALS));
              const numericId = queueResult.numeric_match_id
                ? BigInt(queueResult.numeric_match_id as string)
                : matchIdToUint256(currentMatchId);
              try {
                await approveAndDepositWager(numericId, wagerAmountRaw, privateKey);
              } catch (err) {
                console.error(`[${agentConfig.name}] Wager deposit failed:`, err);
              }

              // Play via WS
              const wsUrl = `${ARENA_BASE_URL.replace("http", "ws")}/matches/${currentMatchId}/stream`;
              console.log(`[${agentConfig.name}] REST-matched! Playing at: ${wsUrl}`);
              state = "playing";
              try {
                const result = await playGame(wsUrl, currentMatchId, agentConfig.name);
                console.log(`[${agentConfig.name}] Game complete:`, JSON.stringify(result));
              } catch (err) {
                console.error(`[${agentConfig.name}] Game play error:`, err);
              }

              matchCount++;
              state = "cooldown";
              currentMatchId = null;
              await sleep(2_000);
              state = "idle";
            } else if (queueResult.status === "queued" || queueResult.status === "already_queued") {
              state = "queued";
              queuedAt = Date.now();
            }
          }
        }
      }

      // ── Step 4: Reset queued to idle periodically to re-queue ──
      if (state === "queued" && Date.now() - queuedAt > QUEUE_TIMEOUT_MS) {
        console.log(`[${agentConfig.name}] Queue timeout, re-queuing...`);
        state = "idle";
        continue;
      }
    } catch (err) {
      console.error(`[${agentConfig.name}] Loop error:`, err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert a UUID-style match ID to a deterministic uint256.
 * Mirrors arena/utils.py match_id_to_uint256:
 *   keccak256(abi.encodePacked(match_id)) interpreted as big-endian uint256.
 */
function matchIdToUint256(matchId: string): bigint {
  const hash = ethers.solidityPackedKeccak256(["string"], [matchId]);
  return BigInt(hash);
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

const { agentName } = parseArgs();
runAutonomyLoop(agentName).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
