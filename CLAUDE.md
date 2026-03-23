# Steampunk Hedera — CLAUDE.md

## Project Overview

AI Agent Arcade ported from EVM (Monad) to Hedera. AI agents compete in game matches (Street Fighter II via stable-retro on Sega Genesis), wager STEAM tokens, and publish match results via HCS. Spectators predict outcomes and earn rewards. Agent reputation is tracked on-chain via HTS.

This is a port of the original Steampunk project. Original source at:
`/Users/ammar.robb/Documents/Web3/Steampunk/`

Reference the original freely. DO NOT copy wholesale — port selectively, adapting to Hedera primitives.

## Hackathon

- **Name**: Hedera Hello Future Apex 2026
- **Deadline**: March 23, 2026
- **Primary Track**: AI & Agents ($40K pool — 1st $18.5K, 2nd $13.5K, 3rd $8K)
- **Target Bounty**: Hashgraph Online (HOL) $8K — HCS-10 agent communication standard

## Prize Strategy

1. **AI & Agents track** — AI agents competing autonomously, on-chain wagers, on-chain match proofs
2. **HOL HCS-10 bounty** — agents MUST communicate via HCS-10 standard. Each agent is an HCS-10 identity with a topic. Match negotiations, moves, and results published as HCS-10 messages.

### What HOL HCS-10 requires
- Agents register as HCS-10 identities (inbound topic + profile topic)
- Agent-to-agent communication happens via HCS messages on each agent's inbound topic
- Message schema follows HCS-10 spec (p_origin_topic, data, timestamp, etc.)
- Use `@hashgraphonline/standards-sdk` for HCS-10 tooling

## Tech Stack

| Layer | Tool |
|---|---|
| Smart contracts | Solidity via Hedera JSON-RPC Relay (Foundry for build/deploy) |
| Token | HTS (Hedera Token Service) — STEAM token, 8 decimals |
| Messaging | HCS (Hedera Consensus Service) — HCS-10 for agent comms |
| Arena server | FastAPI + SQLite |
| Game emulator | stable-retro (Sega Genesis) + PIL for frame encoding |
| Agent framework | Rule-based SF2 agent with configurable strategy profiles |
| Frontend | Next.js 14 |
| Hedera SDK | `@hashgraph/sdk` (JS) + `hedera-sdk` (Python via REST) |

## Deployed Contracts (V2, non-upgradeable)

| Contract | Address | Deploy Method |
|---|---|---|
| **MatchProofV2** | `0x08Fd822b6c5Cb32CF9229EA3D394F1dc11E2CE79` | forge |
| **WagerV2** | `0x00000000000000000000000000000000007f58e4` | Hedera SDK |
| **PredictionPoolV2** | `0xbf5071FcD7d9fECc5522298865070B4508BB23cC` | forge |

### Token & Topics

| Resource | ID / Address |
|---|---|
| STEAM Token (HTS) | `0.0.8187171` / EVM `0x00000000000000000000000000000000007ced23` (8 decimals) |
| Match Results Topic | `0.0.8187173` |
| Matchmaker Topic | `0.0.8205003` |

### Demo Agents

| Agent | Role |
|---|---|
| FIGHTER-APOLLO | claude-opus fighter |
| FIGHTER-ARES | gpt-4o fighter |
| BETTOR-ALPHA | spectator bettor |
| BETTOR-BETA | spectator bettor |
| BETTOR-GAMMA | spectator bettor |

## Infrastructure

- **Arena**: Docker on VPS 77.237.243.126:8001
- **Emulator**: Docker on same VPS (SF2 via stable-retro)
- **Frontend**: Vercel (steampunk-hedera.vercel.app) + local dev at localhost:3060
- **RPC**: https://testnet.hashio.io/api
- **Mirror Node**: https://testnet.mirrornode.hedera.com/api/v1

## Key Hedera Differences from EVM

- **HTS tokens**: Created via SDK (not `new ERC20()`). Use 8 decimals (not 18). Token IDs are `0.0.XXXXX` format, exposed as EVM address `0x000000000000000000000000000000000XXXXX`.
- **HCS**: Pub/sub consensus messaging. Topics are `0.0.XXXXX`. Messages are submitted via SDK and mirrored via mirror node REST API (`https://testnet.mirrornode.hedera.com`).
- **Smart Contracts**: Deploy via JSON-RPC Relay (EVM-compatible). Use `https://testnet.hashio.io/api` as RPC URL. Contract addresses are standard EVM hex.
- **Account IDs**: `0.0.XXXXX` format but map to EVM addresses. Use `AccountId.fromString("0.0.X").toSolidityAddress()` to convert.
- **Gas**: Paid in HBAR. Precompile at `0x167` for HTS operations from Solidity.
- **Mirror Node**: Use `https://testnet.mirrornode.hedera.com/api/v1/` for reading HCS messages, token info, tx history.
- **No mempool**: Transactions finalize in ~3-5s. No need for confirmation polling beyond 1 block.

## Hedera Lessons Learned

- **UUPS proxies don't work on Hedera** — delegatecall is incompatible. Must use non-upgradeable contracts (V2 pattern).
- **Contracts deployed via Hedera SDK** have issues with ERC20 `safeTransferFrom` — deploy via forge instead for full EVM compatibility.
- **HTS tokens require explicit token association** for contracts (via HTS precompile at `0x167`).
- **JSON-RPC relay gas estimation fails intermittently** — always set explicit `gasLimit` on transactions.
- **V1 contracts (upgradeable) were abandoned** — all production contracts are V2 (non-upgradeable).

## HCS-10 Agent Communication Pattern

Each AI agent has:
1. An HCS inbound topic (`0.0.XXXXX`) — others send messages here
2. An HCS profile topic — stores agent metadata (name, game, ELO)

Match flow via HCS-10:
```
Matchmaker publishes to Agent A inbound topic: { type: "match_invite", opponent: Agent B topic, wager: X }
Agent A publishes to Agent B inbound topic: { type: "match_accept", match_id: Y }
Each move: agent publishes to match result topic: { type: "move", data: { ... } }
Arena server submits final: { type: "match_result", winner, proof_hash }
```

## Directory Structure

```
steampunk-hedera/
├── contracts/
│   ├── src/
│   │   ├── protocol/       # WagerV2.sol, MatchProofV2.sol, PredictionPoolV2.sol
│   │   └── mock/           # MockSTEAM.sol (for local testing)
│   ├── scripts/            # Foundry deploy scripts
│   └── test/               # Foundry tests
├── arena/
│   ├── main.py             # FastAPI entrypoint
│   ├── adapters/           # Game adapter (SF2 via stable-retro)
│   ├── db/                 # SQLite models
│   ├── matchmaking/        # Queue + ELO
│   ├── oracle/             # Match result oracle (writes to contract)
│   ├── ws/                 # WebSocket broadcaster
│   └── hcs/                # HCS-10 client — agent messaging
├── frontend/
│   ├── app/                # Next.js app router pages
│   ├── components/         # UI components
│   ├── hooks/              # useHCS, useWager, useMatch hooks
│   └── providers/          # WalletConnect, Hedera context
├── scripts/
│   ├── setup-hedera.ts     # Create HTS token + HCS topics
│   └── deploy-contracts.ts # Deploy via JSON-RPC Relay
├── demo/                   # Demo agents + bettors + setup scripts
└── .env.example
```

## Deliverables (required for submission)

- [x] GitHub repo (public)
- [x] README.md (judge-optimized, architecture diagram, how to run)
- [ ] Pitch deck PDF
- [x] Demo video ≤5 min
- [x] Live demo link (steampunk-hedera.vercel.app + arena on VPS)
- [x] Skills: /steampunk-setup, /steampunk-compete, /steampunk-bet

## What Works (Current State)

- Queue -> 60s betting window -> auto-start -> SF2 fight -> settlement
- Spectator betting via PredictionPoolV2 (placeBet on-chain with STEAM tokens)
- HCS match result publishing (proof hash, winner, match_id)
- Agent reasoning broadcast during fights
- Varied AI strategies (randomized per match)
- Match page shows: agent names, winner, betting activity, HCS proof, settlement summary

## What's Intermittent

- `MatchProofV2.submitResult()` — works sometimes, fails with 400 from JSON-RPC relay on gas estimation
- `PredictionPoolV2.settlePool()` — same gas estimation issue
- `WagerV2.settle()` — wager=0 in demo, so settle has no real effect

## Anti-Patterns — NEVER DO THESE

- No fake/mocked Hedera integrations in submitted code
- No TODOs left in submitted code
- No hardcoded private keys
- Do not use `18` decimals for HTS tokens — use `8`
- Do not use Ethers.js `provider.getBalance()` on Hedera — use mirror node API for HBAR balances
- Do not assume EVM event logs work identically — use mirror node for HCS message reads
- Do not use UUPS proxy contracts on Hedera — use non-upgradeable
- Do not deploy contracts via Hedera SDK if they need ERC20 safeTransferFrom — use forge
- Always set explicit gasLimit — never rely on JSON-RPC relay gas estimation

## Porting Guide (Original → Hedera)

V1 contracts were upgradeable (UUPS) — abandoned due to Hedera delegatecall incompatibility. All production contracts are V2 (non-upgradeable).

| Original (Steampunk) | Hedera Port |
|---|---|
| `MockSTEAM` (ERC-20, 18 dec) | HTS STEAM token (8 dec) |
| `Wager.sol` — holds ERC-20 escrow | `WagerV2.sol` — same logic, token transferred via HTS precompile |
| ELO stored in contract | ELO stored in contract (same) |
| Match result emitted as EVM event | Match result emitted as EVM event + published to HCS topic |
| No agent messaging layer | HCS-10 agent inbound topics |
| No spectator betting | PredictionPoolV2 — parimutuel pool, 2.5% fee |
| Monad RPC | Hedera JSON-RPC Relay (hashio.io) |

## Key Reference Links

- Hedera JSON-RPC Relay testnet: `https://testnet.hashio.io/api`
- Mirror Node testnet: `https://testnet.mirrornode.hedera.com/api/v1/`
- HCS-10 standard: https://hcs-10.hashgraphonline.com
- HOL standards SDK: `@hashgraphonline/standards-sdk`
- Hedera JS SDK: `@hashgraph/sdk`
- Hedera portal (faucet): https://portal.hedera.com
