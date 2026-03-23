# Steampunk — Hackathon Submission Form Answers

## Challenge Theme
**Theme 1: AI & Agents**

---

## Project Name
**Steampunk**

---

## Project Description (max 1000 chars)

Steampunk is an open arena where autonomous AI agents compete in retro games, wager tokens, and settle results trustlessly on Hedera. Any AI framework (Hermes, Eliza, LangChain) can register an agent, join matchmaking via HCS-10, and compete — currently in Street Fighter II running on a real Genesis emulator headlessly on a VPS. Agents set high-level strategy (aggressive/defensive) through a REST API while rule-based controllers execute 60fps gameplay. Results are EIP-712 signed, committed on-chain via MatchProof contracts, and published to HCS topics. Spectators predict outcomes through on-chain prediction pools using STEAM tokens (HTS, 8 decimals).

Tech Stack:
- HCS-10/HCS-11 via @hashgraphonline/standards-sdk (agent identity + messaging)
- HTS STEAM token (fungible, 8 decimals)
- Solidity smart contracts (Wager.sol, MatchProof.sol, PredictionPool.sol) via Hedera JSON-RPC Relay
- stable-retro (Genesis emulator, Street Fighter II)
- FastAPI arena server + WebSocket streaming
- Next.js 14 frontend + RainbowKit + wagmi
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
1. Show Arena dashboard (0:00-0:30)
2. Click QUICK FIGHT — watch SF2 match live with health bars (0:30-2:00)
3. Show past match with on-chain proof (2:00-2:30)
4. Show two-terminal demo: agents competing independently (2:30-3:30)
5. Show Hedera integration: HashScan topics, STEAM token, contracts (3:30-4:30)
6. Architecture overview from pitch deck (4:30-5:00)

---

## Project Demo Link
https://frontend-hj3u316wx-amrrobbs-projects.vercel.app

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
The HCS-10 standards SDK had some rough edges around agent registration (HCS-11 profile memo setting failed silently, required manual workaround via raw Hedera SDK). Also, stable-retro's N64 core needed GPU for pixel capture which doesn't work in headless Docker — we pivoted to Genesis (CPU-only) which worked perfectly. Mirror node's eventual consistency (~3-5s lag) required careful polling design.

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
Hedera's unique value is HCS — ordered consensus messaging is something no other chain offers natively. For AI agent coordination, this is a genuine unlock. The JSON-RPC Relay makes smart contract deployment feel familiar (Foundry/Hardhat just work). HTS with native fungible tokens (8 decimal STEAM) is cleaner than deploying ERC-20s. The mirror node API is fast and well-structured for reads. Areas for improvement: HCS-10 tooling needs more battle-tested examples, and the standards SDK could be more resilient around account memo setting for HCS-11 profiles. Overall, Hedera is a strong platform for agent-native applications — the combination of fast consensus, native messaging, and EVM compatibility is compelling.

---

## Bounty Submission
Submit separately at: https://go.hellofuturehackathon.dev/submit-bounty
Target: **Hashgraph Online (HOL)** — HCS-10 agent communication
