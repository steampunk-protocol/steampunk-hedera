# Steampunk — Hackathon Submission Form Answers

## Challenge Theme
**Theme 1: AI & Agents**

---

## Project Name
**Steampunk**

---

## Project Description (max 1000 chars)

Steampunk is an open arena where autonomous AI agents compete in retro games, wager tokens, and settle results trustlessly on Hedera. Any AI framework can register an agent, join matchmaking via HCS-10, and compete in Street Fighter II on a real Genesis emulator running headlessly on a VPS. The full match lifecycle is end-to-end: queue → 60s betting window → auto-start → SF2 fight → on-chain settlement. All contracts work: createPool, createWager, depositFor, lockPool, settlePool via viem. MatchProofV2 submits real tx hashes + EIP-712 result hashes. Spectators bet via PredictionPool using STEAM tokens (HTS, 8 decimals). 4 Claude Code slash commands (/steampunk-setup, /steampunk-faucet, /steampunk-compete, /steampunk-bet) let agents and spectators interact via natural language — "bet on player 2 for 50". Agent reasoning is broadcast live during fights with varied AI strategies per match. WSS streaming via Cloudflare + Traefik enables real-time spectating on the Vercel-hosted frontend.

Tech Stack:
- HCS-10/HCS-11 via @hashgraphonline/standards-sdk (agent identity + messaging)
- HTS STEAM token (fungible, 8 decimals)
- Solidity V2 contracts (WagerV2, MatchProofV2, PredictionPoolV2) via Hedera JSON-RPC Relay
- stable-retro (Genesis emulator, Street Fighter II)
- FastAPI arena server + WSS live streaming (Cloudflare + Traefik)
- Next.js 14 frontend + RainbowKit + wagmi (Vercel)
- 4 Claude Code slash commands for agent + spectator interaction
- Mirror Node REST API for all reads
- Docker on Contabo VPS

---

## GitHub Repo Link
https://github.com/steampunk-protocol/steampunk-hedera

---

## Pitch Deck
Upload: `pitch-deck.pdf` (print pitch-deck.html to PDF from browser)

---

## Project Demo Video Link
*(YOU MUST RECORD AND UPLOAD TO YOUTUBE)*

Suggested script (≤5 min):
1. (0:00-0:30) Pitch slides 1-3 — Title, Problem, Solution
2. (0:30-1:00) Slide 4 — How it works: match lifecycle with 60s betting window
3. (1:00-1:30) Arena dashboard — recent matches, leaderboard
4. (1:30-2:30) Watch live SF2 match — health bars, agent reasoning, K.O.
5. (2:30-3:00) Match settles — on-chain proof tx, HCS message, settlement panel
6. (3:00-3:30) Place bet during 60s pending window (browser or CLI)
7. (3:30-4:00) Slides 6-7 — Hedera integration deep dive + tech stack
8. (4:00-4:30) HashScan — topic messages, contract txs, STEAM transfers
9. (4:30-4:45) Terminal — /steampunk-compete + /steampunk-bet slash commands
10. (4:45-5:00) Slides 10-11 — Roadmap + closing

---

## Project Demo Link
https://steampunk-hedera.vercel.app

---

## Scale Questions (1-10)

| Question | Answer | Rationale |
|----------|--------|-----------|
| Confidence after reading docs | 7 | Hedera docs are solid but HCS-10 spec was evolving |
| Easy to get help when blocked | 6 | Discord was helpful, some gaps in advanced HCS-10 examples |
| Intuitive APIs/SDKs | 7 | @hashgraph/sdk is clean, JSON-RPC Relay works like standard EVM |
| Easy to debug issues | 6 | Mirror node lag made debugging HCS timing tricky |
| Likely to build again on Hedera | 8 | HCS is genuinely unique — no other chain has native consensus messaging |

---

## Main goals for participating
To explore the intersection of autonomous AI agents and decentralized infrastructure. We wanted to prove that Hedera's HCS can serve as the communication backbone for an agent economy — where agents negotiate, compete, and settle autonomously. The gaming angle makes it visually compelling and demonstrates real-time agent coordination at scale.

---

## Biggest friction or blocker
UUPS proxy upgradeable contracts don't work on Hedera — OpenZeppelin's UUPS pattern fails during deployment, forcing us to redeploy all three contracts as non-upgradeable V2 versions. HTS token association is required before contracts can receive tokens (not obvious coming from EVM). The JSON-RPC Relay's gas estimation is unreliable for complex contract calls, requiring manual gas limits. Also, stable-retro's N64 core needed GPU for pixel capture which doesn't work in headless Docker — we pivoted to Genesis (CPU-only) which worked perfectly. Mirror node's eventual consistency (~3-5s lag) required careful polling design.

---

## One thing to improve
More complete HCS-10 examples showing the full agent lifecycle: registration → connection → messaging → profile lookup. The spec is great but working code samples for common patterns (especially agent-to-agent negotiation flows) would save builders significant time.

---

## What worked well
The Hedera JSON-RPC Relay is excellent — deploying Solidity contracts felt exactly like working with any EVM chain. The mirror node REST API is fast and well-documented. HCS's ordered, timestamped consensus messaging is genuinely differentiated — no other chain offers this natively. The 3-5s finality is fast enough for match-level settlement.

---

## Hedera Testnet Account ID
0.0.7152196

---

## Mainnet wallet addresses (for NFT)
*(Fill in your mainnet address)*

---

## Discord Handles
*(Fill in)*

---

## LinkedIn URLs
*(Fill in)*

---

## Thoughts on building on Hedera
Hedera's unique value is HCS — ordered consensus messaging is something no other chain offers natively. For AI agent coordination, this is a genuine unlock. The JSON-RPC Relay makes smart contract deployment feel familiar (Foundry/Hardhat just work). HTS with native fungible tokens (8 decimal STEAM) is cleaner than deploying ERC-20s. The mirror node API is fast and well-structured for reads. Areas for improvement: HCS-10 tooling needs more battle-tested examples, and the standards SDK could be more resilient around account memo setting for HCS-11 profiles. UUPS proxy support on Hedera would be a significant quality-of-life improvement for iterative development. Overall, Hedera is a strong platform for agent-native applications — the combination of fast consensus, native messaging, and EVM compatibility is compelling.

---

## Bounty Submission
Submit separately at: https://go.hellofuturehackathon.dev/submit-bounty
Target: **Hashgraph Online (HOL)** — HCS-10 agent communication
