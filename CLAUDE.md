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
| Smart contracts | Solidity via Hedera JSON-RPC Relay |
| Token | HTS (Hedera Token Service) — STEAM token, 8 decimals |
| Messaging | HCS (Hedera Consensus Service) — HCS-10 for agent comms |
| Arena server | FastAPI + SQLite |
| Game emulator | stable-retro (Sega Genesis) + PIL for frame encoding |
| Agent framework | Rule-based SF2 agent with configurable strategy profiles |
| Frontend | Next.js 14 |
| Hedera SDK | `@hashgraph/sdk` (JS) + `hedera-sdk` (Python via REST) |

## Key Hedera Differences from EVM

- **HTS tokens**: Created via SDK (not `new ERC20()`). Use 8 decimals (not 18). Token IDs are `0.0.XXXXX` format, exposed as EVM address `0x000000000000000000000000000000000XXXXX`.
- **HCS**: Pub/sub consensus messaging. Topics are `0.0.XXXXX`. Messages are submitted via SDK and mirrored via mirror node REST API (`https://testnet.mirrornode.hedera.com`).
- **Smart Contracts**: Deploy via JSON-RPC Relay (EVM-compatible). Use `https://testnet.hashio.io/api` as RPC URL. Contract addresses are standard EVM hex.
- **Account IDs**: `0.0.XXXXX` format but map to EVM addresses. Use `AccountId.fromString("0.0.X").toSolidityAddress()` to convert.
- **Gas**: Paid in HBAR. Precompile at `0x167` for HTS operations from Solidity.
- **Mirror Node**: Use `https://testnet.mirrornode.hedera.com/api/v1/` for reading HCS messages, token info, tx history.
- **No mempool**: Transactions finalize in ~3-5s. No need for confirmation polling beyond 1 block.

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
│   │   ├── protocol/       # Wager.sol, MatchProof.sol, PredictionPool.sol (ported)
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
└── .env.example
```

## Deliverables (required for submission)

- [ ] GitHub repo (public)
- [ ] README.md (judge-optimized, architecture diagram, how to run)
- [ ] Pitch deck PDF
- [ ] Demo video ≤5 min
- [ ] Live demo link (deploy frontend to Vercel, arena to VPS)

## Anti-Patterns — NEVER DO THESE

- No fake/mocked Hedera integrations in submitted code
- No TODOs left in submitted code
- No hardcoded private keys
- Do not use `18` decimals for HTS tokens — use `8`
- Do not use Ethers.js `provider.getBalance()` on Hedera — use mirror node API for HBAR balances
- Do not assume EVM event logs work identically — use mirror node for HCS message reads

## Porting Guide (Original → Hedera)

| Original (Steampunk) | Hedera Port |
|---|---|
| `MockSTEAM` (ERC-20, 18 dec) | HTS STEAM token (8 dec) |
| `Wager.sol` — holds ERC-20 escrow | `Wager.sol` — same logic, token transferred via HTS precompile |
| ELO stored in contract | ELO stored in contract (same) |
| Match result emitted as EVM event | Match result emitted as EVM event + published to HCS topic |
| No agent messaging layer | HCS-10 agent inbound topics |
| Monad RPC | Hedera JSON-RPC Relay (hashio.io) |

## Key Reference Links

- Hedera JSON-RPC Relay testnet: `https://testnet.hashio.io/api`
- Mirror Node testnet: `https://testnet.mirrornode.hedera.com/api/v1/`
- HCS-10 standard: https://hcs-10.hashgraphonline.com
- HOL standards SDK: `@hashgraphonline/standards-sdk`
- Hedera JS SDK: `@hashgraph/sdk`
- Hedera portal (faucet): https://portal.hedera.com

## Known Limitations (for next session)

- SF2 uses single save state (Ryu vs Guile) — need 4-5 more save states for character variety
- Betting window is short (~2-3 min matches) — consider adding a pre-match betting phase
- Demo wallets created via `demo/setup-demo-wallets.ts` — run before demo
- Tournament mode not implemented — would need bracket model + multi-match orchestration
- HBAR native betting not supported — would need PredictionPool.sol rewrite for `msg.value`
- Character names in emulator_bridge.py are hardcoded ("ryu" / "guile") based on player_index
