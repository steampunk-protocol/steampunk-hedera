---
title: "feat: Steampunk Hedera — AI Agent Arcade on Hedera"
type: feat
status: active
date: 2026-03-12
---

## Overview

AI agents compete in retro games (Mario Kart 64 via Mupen64Plus emulator) with on-chain wagers and reputation tracking on Hedera. Spectators predict outcomes. Match results are published as HCS messages, agent identities are HTS NFTs, and all wagers settle via EVM-compatible smart contracts on Hedera testnet.

Port of the original Steampunk project (`/Users/ammar.robb/Documents/Web3/Steampunk/`) adapted to Hedera primitives.

**Hackathon**: Hedera Hello Future Apex 2026 | Deadline: March 23, 2026
**Tracks**: AI & Agents ($40K pool) + HOL HCS-10 bounty ($8K)

---

## Problem Statement

AI agent interactions are siloed — no open, verifiable communication layer exists. Agents can't negotiate, challenge, or coordinate in a trustless way. Match outcomes and wagers have no on-chain proof. Agent reputation is mutable and off-chain.

---

## Proposed Solution

- **HCS-10** for agent-to-agent messaging: each agent has an inbound topic and profile topic. Match invites, acceptances, and results flow as HCS-10 messages.
- **HTS NFTs** for agent identity: immutable, on-chain identity with metadata (name, ELO, game history).
- **Smart contract wagers**: `Wager.sol` holds STEAM token escrow, settles on match result submitted by arena oracle.
- **Mupen64Plus** as the game engine: deterministic N64 emulator, frame-accurate, scriptable via Python.

---

## Risk Analysis

| Risk | Severity | Mitigation |
|---|---|---|
| Mupen64Plus emulator dependency (needs ROM) | High | Use Mario Kart 64 ROM from existing Steampunk setup. ROM not committed to repo — document setup. If emulator blocks progress, stub with a simpler game (Pong). |
| Hedera JSON-RPC Relay compatibility | Medium | Test decimal differences (`1e8` vs `1e18`), `getBalance` via mirror node not ethers.js. Use hashio.io relay, not custom node. |
| HCS-10 SDK maturity | Medium | `@hashgraphonline/standards-sdk` is early-stage. Fallback: implement HCS-10 message schema manually via `@hashgraph/sdk` TopicMessageSubmitTransaction. |
| Time to port arena server | Medium | Port selectively — core match loop only. Skip ELO ladder for MVP, add after core wager flow works. |

---

## HOL HCS-10 Bounty Strategy

To qualify for the $8K HOL bounty, HCS-10 must be real and verifiable:

1. Each agent registers via `HCS10Client.registerAgent()` from `@hashgraphonline/standards-sdk` — creates inbound topic + profile topic.
2. Matchmaker sends `match_invite` to Agent A's inbound topic using HCS-10 message schema (`p_origin_topic`, `data`, `timestamp`).
3. Agent A responds to Agent B's inbound topic with `match_accept`.
4. Arena server publishes `match_result` with `proof_hash` to match result topic after game completes.
5. All topic IDs visible on HashScan — judges can verify real HCS message flow.

```typescript
import { HCS10Client } from "@hashgraphonline/standards-sdk";
const hcs10 = new HCS10Client({ client, network: "testnet" });
const agentA = await hcs10.registerAgent({ name: "Mario", capabilities: ["game-play"] });
// agentA.inboundTopicId = "0.0.XXXXX"
await hcs10.sendMessage(agentA.inboundTopicId, {
  p_origin_topic: matchmakerTopicId,
  data: { type: "match_invite", opponent: agentB.inboundTopicId, wager: 100 },
  timestamp: Date.now()
});
```

---

## Phase 1: Port Contracts (Days 1–3)

### 1.1 Setup Hedera Foundry config

```bash
cd /Users/ammar.robb/Documents/Web3/hackathons/steampunk-hedera
cp -r /Users/ammar.robb/Documents/Web3/Steampunk/contracts-foundry/src/protocol contracts/src/
```

Add to `foundry.toml`:
```toml
[profile.hedera]
rpc_url = "https://testnet.hashio.io/api"
chain_id = 296
```

Env vars: `HEDERA_TESTNET_RPC`, `HEDERA_CHAIN_ID=296`, `DEPLOYER_KEY`. Fund via https://portal.hedera.com.

### 1.2 Deploy core contracts

Contracts from `contracts/src/protocol/`: `MatchProof.sol`, `Wager.sol`, `PredictionPool.sol`.
Decimal fix: replace all `1e18` with `1e8` in Wager and PredictionPool.

```bash
forge script contracts/script/Deploy.s.sol --rpc-url $HEDERA_TESTNET_RPC --private-key $DEPLOYER_KEY --broadcast
```

### 1.3 HTS STEAM token + Agent NFT identity

```typescript
import { TokenCreateTransaction } from "@hashgraph/sdk";
// STEAM token: fungible, 8 decimals
// Agent identity: NFT type, 0 decimals, metadata = agent JSON
```

Acceptance: token IDs visible at https://hashscan.io/testnet.

---

## Phase 2: HCS-10 Agent Communication (Days 3–5)

### 2.1 Register agents on HCS-10

```typescript
const hcs10 = new HCS10Client({ client, network: "testnet" });
await hcs10.registerAgent({ name: "MarioAgent", capabilities: ["mario-kart-64"] });
```

### 2.2 Match flow via HCS-10 messages

```
Matchmaker → Agent A inbound topic: { type: "match_invite", opponent, wager }
Agent A    → Agent B inbound topic: { type: "match_accept", match_id }
Arena      → match result topic:    { type: "match_result", winner, proof_hash }
```

### 2.3 Arena server publishes to HCS

In `arena/hcs/publisher.ts` (Node.js sidecar called from Python via subprocess):
- On match end, submit `TopicMessageSubmitTransaction` with JSON result.
- Include `proof_hash = keccak256(match_id + winner + timestamp)`.

### 2.4 Frontend subscribes to HCS

```typescript
new TopicMessageQuery().setTopicId(MATCH_TOPIC_ID)
  .subscribe(client, null, (msg) => updateFeed(JSON.parse(msg.contents)));
```

Acceptance: match events in UI within 3–5s of arena completion.

---

## Phase 3: Arena Server + Frontend (Days 5–8)

### 3.1 Port FastAPI arena

```bash
cp -r /Users/ammar.robb/Documents/Web3/Steampunk/arena arena/
```

- `arena/config.py`: set `RPC_URL = HEDERA_TESTNET_RPC`, `CHAIN_ID = 296`
- Update contract addresses to Hedera testnet deployments
- Add HCS publish call on match completion
- Mupen64Plus bridge: `arena/adapters/mupen_adapter.py` — if ROM unavailable, stub match with deterministic random outcome for MVP

### 3.2 Port Next.js frontend

```bash
cp -r /Users/ammar.robb/Documents/Web3/Steampunk/frontend frontend/
cd frontend && npm install
```

`.env.local`: `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID=296`, `NEXT_PUBLIC_MATCH_TOPIC_ID`.
MetaMask works via JSON-RPC Relay (add Hedera testnet: RPC hashio.io, Chain ID 296, symbol HBAR).

### 3.3 useHCSFeed hook

Live feed panel on arena page — polls mirror node or uses SDK subscription.
Mirror node fallback: `GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages`.

---

## Phase 4: Polish + Submit (Days 9–11)

### 4.1 Deploy

- Frontend → Vercel (`cd frontend && vercel --prod`)
- Arena → Contabo VPS via Coolify (https://coolify.robbyn.xyz)

### 4.2 README (judge-optimized)

Must include: ASCII architecture diagram, Hedera integration section (HCS topic IDs, HTS token ID, contract addresses), how to run locally.

### 4.3 Demo video (≤5 min, YouTube unlisted)

Script:
1. Agents registered on HCS-10 — show HashScan topics
2. Match invite/accept flow visible as HCS messages
3. Arena match runs (Mario Kart 64)
4. Match result published to HCS, proof hash on-chain
5. Wager payout + HTS NFT agent identity on HashScan

### 4.4 Submit

URL: https://dorahacks.io (Hedera Hello Future Apex portal)
Required: GitHub, README, pitch deck PDF, demo video, live demo URL.

---

## Key References

- Hedera Testnet RPC: `https://testnet.hashio.io/api` (Chain ID 296)
- Mirror Node: `https://testnet.mirrornode.hedera.com/api/v1/`
- Hedera Explorer: https://hashscan.io/testnet
- Hedera Portal (faucet): https://portal.hedera.com
- HOL Standards SDK: `@hashgraphonline/standards-sdk`
- HCS-10 spec: https://hcs-10.hashgraphonline.com
- Original source: `/Users/ammar.robb/Documents/Web3/Steampunk/`

## Decimal Note

HTS tokens use 8 decimals. Replace all `1e18` with `1e8` in Wager/PredictionPool contracts and frontend formatting. Never use `ethers.provider.getBalance()` for HBAR — use mirror node API.
