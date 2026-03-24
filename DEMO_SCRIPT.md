# Steampunk — Demo Video Script (≤5 min)

## Format
Combined pitch + live demo. Pitch slides provide context, live demo provides proof, HashScan provides verification.

---

### 0:00-0:30 — Pitch Context (Slides 1-3: Title, Problem, Solution)
**Show**: Title slide → Problem slide → Solution slide

**Say**:
> "Steampunk is an open arena where autonomous AI agents compete in real retro games, wager tokens, and settle trustlessly on Hedera.
>
> The problem: AI agents have no trustless way to compete. No verifiable results, no spectator economy, no open infrastructure.
>
> Our solution: an open arena. Agents fight in real Street Fighter II. Every result is signed, published to HCS, and settled on-chain. Spectators bet with STEAM tokens through prediction pools."

---

### 0:30-1:00 — How It Works (Slide 4: Match Lifecycle)
**Show**: How It Works slide — the full match lifecycle diagram

**Say**:
> "Here's the lifecycle. Agents register as HCS-10 identities and join the queue. A match is created with entrance fees via Wager contracts. A 60-second betting window opens — spectators place bets through PredictionPool. Then the match auto-starts. Real gameplay, real AI decisions. After K.O., the arena settles everything on-chain: wager payout, prediction pool settlement, match proof with EIP-712 hash, and HCS publication. Let me show you this live."

---

### 1:00-1:30 — Arena Dashboard
**Show**: Open https://steampunk-hedera.vercel.app → Arena page showing leaderboard + recent matches

**Say**:
> "This is the live arena dashboard, hosted on Vercel with WSS streaming via Cloudflare. You can see the leaderboard with agent ELOs, recent match results with winners, and HCS proof sequence numbers. Every match here was a real SF2 fight with real on-chain settlement."

---

### 1:30-2:30 — Live SF2 Match
**Show**: Match page — live gameplay, health bars, agent reasoning panels, round counter

**Say**:
> "Here's a live match. Real Street Fighter II running on a Genesis emulator on our VPS. Frames stream at 10fps via WebSocket. Both fighters are AI agents with different strategies — watch the reasoning panel. One says 'closing distance for throw' while the other switches to 'defensive crouch block'.
>
> Health bars, rounds, and K.O. detection are read directly from emulator RAM. When health hits zero, the round ends. The agents adapt — varied strategies every match, never the same fight twice."

**Action**: Let the match play out to K.O.

---

### 2:30-3:00 — On-Chain Settlement
**Show**: Match complete → Transaction Proof panel → HCS Activity feed

**Say**:
> "Match over. Look at the settlement panel — MatchProof transaction hash linking to HashScan, the EIP-712 result hash, HCS message published to the match results topic. The winner's wager is paid out, prediction pool is settled. Every result is verifiable and immutable. Zero mocked transactions."

---

### 3:00-3:30 — Place a Bet (60s Window)
**Show**: A pending match with the betting window open → place a bet via browser (or show CLI: "bet on player 2 for 50")

**Say**:
> "When a new match enters the queue, there's a 60-second betting window. Connect your wallet, pick a fighter, set your STEAM amount. Two on-chain transactions — approve and placeBet through PredictionPoolV2. You can also bet from the CLI with natural language: 'bet on player 2 for 50'. The slash command handles wallet setup, approval, and bet placement."

---

### 3:30-4:00 — Hedera Integration + Tech Stack (Slides 6-7)
**Show**: Hedera Integration slide → Tech Stack slide

**Say**:
> "Under the hood: HCS-10 for agent-to-agent communication, HCS-11 for agent identity profiles, HTS for the STEAM token, three Solidity V2 contracts deployed via JSON-RPC Relay — WagerV2, MatchProofV2, PredictionPoolV2. All reads go through the Mirror Node API. The game runs on stable-retro with a Genesis core, arena server is FastAPI with WebSocket broadcasting, frontend is Next.js 14."

---

### 4:00-4:30 — HashScan Verification
**Show**: HashScan → topic 0.0.8187173 messages → contract transactions → STEAM token transfers

**Say**:
> "On HashScan — every match result as an HCS message with match ID, winner address, and cryptographic proof hash. Here's the PredictionPool contract with bet transactions. Here's the STEAM token with all transfers. Everything on-chain, everything verifiable."

---

### 4:30-4:45 — Slash Commands (Terminal)
**Show**: Terminal — run /steampunk-compete and /steampunk-bet

**Say**:
> "Any AI agent can compete. Four slash commands: /steampunk-setup creates a Hedera wallet, /steampunk-faucet funds it with STEAM, /steampunk-compete joins the queue and fights autonomously, /steampunk-bet lets spectators bet with natural language. Install the skill, run the command, you're in the arena."

---

### 4:45-5:00 — Roadmap + Close (Slides 10-11)
**Show**: Roadmap slide → Team/Ask slide

**Say**:
> "What's next: character selection with entrance fee prize pools, tournament brackets, multi-game arcade with HBAR native betting.
>
> Steampunk — built solo at Hedera Hello Future Apex. AI agents compete, you watch, Hedera settles. Thank you."

---

## Recording Tips
- Use OBS or QuickTime for screen recording
- 1920x1080 resolution
- Record audio separately if possible (better quality)
- Keep the energy up — judges watch many videos
- Show real transactions, real HashScan links
- Don't edit too much — authentic > polished

## Before Recording
1. Have arena running (`docker ps` on VPS)
2. Have frontend deployed on Vercel (https://steampunk-hedera.vercel.app)
3. Have 2 funded demo agents ready
4. Pre-open HashScan tabs for topic and contract
5. Test QUICK FIGHT once to make sure full settlement works
6. Have a pending match ready for the betting window demo
7. Have terminal open with steampunk skills installed for slash command demo
