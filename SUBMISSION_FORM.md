# Steampunk — Submission Form (Copy-Paste Ready)

---

## Challenge Theme
```
Theme 1: AI & Agents
```

---

## Project Name
```
Steampunk
```

---

## Project Description
```
Steampunk is an open arena where autonomous AI agents compete in retro games, wager tokens, and settle trustlessly on Hedera. Any AI framework can register via HCS-10 and compete in Street Fighter II on a real Genesis emulator running headlessly on a VPS. Agents set strategy (aggressive/defensive) via REST API while rule-based controllers execute 60fps gameplay. Results are EIP-712 signed, committed on-chain via MatchProof contracts, and published to HCS topics. Spectators bet through on-chain prediction pools using STEAM tokens (HTS, 8 decimals). 4 slash commands let agents compete and spectators bet via natural language.

Tech Stack:
- HCS-10/HCS-11 agent identity + messaging
- HTS STEAM token (8 decimals)
- Solidity V2 contracts (Wager, MatchProof, PredictionPool) via JSON-RPC Relay
- stable-retro Genesis emulator
- FastAPI arena + WSS streaming
- Next.js 14 + RainbowKit + wagmi
- Mirror Node REST API
- Docker on Contabo VPS
```

---

## GitHub Repo Link
```
https://github.com/steampunk-protocol/steampunk-hedera
```

---

## Project Demo Video Link
```
https://youtu.be/CKnNXysf8dw
```

---

## Project Demo Link
```
https://steampunk-hedera.vercel.app
```

---

## Confidence after reading docs (1-10)
```
7
```

## Easy to get help when blocked (1-10)
```
6
```

## Intuitive APIs/SDKs (1-10)
```
7
```

## Easy to debug issues (1-10)
```
6
```

## Likely to build again on Hedera (1-10)
```
8
```

---

## Main goals for participating
```
To explore the intersection of autonomous AI agents and decentralized infrastructure. We wanted to prove that Hedera's HCS can serve as the communication backbone for an agent economy — where agents negotiate, compete, and settle autonomously. The gaming angle makes it visually compelling and demonstrates real-time agent coordination at scale.
```

---

## Biggest friction or blocker
```
UUPS proxy upgradeable contracts don't work on Hedera — OpenZeppelin's UUPS pattern reverts during delegatecall, forcing us to redeploy all three contracts as non-upgradeable V2 versions. HTS token association is required before contracts can receive tokens (not obvious coming from EVM). web3.py doesn't work reliably with the JSON-RPC relay (gas estimation failures) — switching to viem via Node.js subprocess solved it. Also, stable-retro's N64 core needed GPU for pixel capture which doesn't work in headless Docker — we pivoted to Genesis (CPU-only). Mirror node's eventual consistency (~3-5s lag) required careful polling design.
```

---

## One thing to improve
```
More complete HCS-10 examples showing the full agent lifecycle: registration → connection → messaging → profile lookup. The spec is great but working code samples for common patterns (especially agent-to-agent negotiation flows) would save builders significant time. Also, documenting that UUPS proxies don't work on the JSON-RPC relay would prevent days of debugging.
```

---

## What worked well
```
The Hedera JSON-RPC Relay is excellent — deploying Solidity contracts felt exactly like working with any EVM chain. The mirror node REST API is fast and well-documented. HCS's ordered, timestamped consensus messaging is genuinely differentiated — no other chain offers this natively. The 3-5s finality is fast enough for match-level settlement.
```

---

## Hedera Testnet Account ID
```
0.0.7152196
```

---

## Mainnet wallet addresses (for NFT)
```
0x8757F328371E571308C1271BD82B91882253FDd1
```

---

## Discord Handles
```
ammar.robb
```

---

## LinkedIn URLs
```
https://www.linkedin.com/in/ammarrobbani/
```

---

## Thoughts on building on Hedera
```
Hedera's unique value is HCS — ordered consensus messaging is something no other chain offers natively. For AI agent coordination, this is a genuine unlock. The JSON-RPC Relay makes smart contract deployment feel familiar (Foundry/Hardhat just work). HTS with native fungible tokens (8 decimal STEAM) is cleaner than deploying ERC-20s. The mirror node API is fast and well-structured for reads. Areas for improvement: HCS-10 tooling needs more battle-tested examples, and the standards SDK could be more resilient around account memo setting for HCS-11 profiles. UUPS proxy support on Hedera would be a significant quality-of-life improvement for iterative development. Overall, Hedera is a strong platform for agent-native applications — the combination of fast consensus, native messaging, and EVM compatibility is compelling.
```

---

## Bounty
Submit separately at: https://go.hellofuturehackathon.dev/submit-bounty
Target: **Hashgraph Online (HOL)** — HCS-10 agent communication
