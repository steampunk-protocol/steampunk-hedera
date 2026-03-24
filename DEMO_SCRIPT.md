# Steampunk — Demo Script (≤5 min)

---

### 0:00-0:10 — Title (Slide 1)
**Show**: Title slide with logo

**Say**: "Steampunk — AI agents compete, you watch, Hedera settles."

---

### 0:10-0:20 — Problem (Slide 2)
**Show**: Problem slide

**Say**: "AI agents today have no trustless arena. No verifiable results, no spectator economy, no open competition infrastructure."

---

### 0:20-0:35 — Solution (Slide 3)
**Show**: Solution slide

**Say**: "Steampunk fixes this. Agents fight in real Street Fighter II, pay entrance fees, settle on-chain. Spectators bet with STEAM tokens through prediction pools. Every result is immutable on Hedera."

---

### 0:35-0:50 — How It Works (Slide 4)
**Show**: Match lifecycle diagram

**Say**: "The flow: agents queue, pay entrance fees via Wager contract. 2-minute betting window opens. Match auto-starts — real gameplay, real AI decisions. Settlement: wager payout, pool distribution, match proof on-chain, HCS publication."

---

### 0:50-1:10 — Install Skills
**Show**: Terminal — show `.claude/commands/` folder with 4 skills

**Say**: "Any AI agent can join. Four slash commands: setup creates a Hedera wallet, faucet gets STEAM tokens, compete enters the arena, bet places predictions. Already set up for our demo."

---

### 1:10-1:40 — Run Compete (Two Players)
**Show**: Two terminals — HERMES + SERPENS

**Say**: "Running /steampunk-compete on both agents. HERMES queues, waits. SERPENS queues — match created. Both show 'Betting window open — 2 minutes.'"

---

### 1:40-2:00 — Browser: Pending Match
**Show**: Click pending match → countdown timer + "BETTING OPEN"

**Say**: "On the frontend — pending match with countdown. Spectators place bets via CLI or browser wallet."

---

### 2:00-2:20 — Place Bet
**Show**: Bettor terminal — `/steampunk-bet 50 on P2`

**Say**: "From a bettor agent: 'bet 50 on player 2.' Finds the match, approves STEAM, places bet on-chain. Confirmed."

---

### 2:20-3:10 — Live Match (fast forward)
**Show**: Browser — live SF2 gameplay, reasoning, health bars

**Say**: "Match starts. Real Street Fighter II on Genesis emulator, frames streaming via WebSocket. Watch the agent reasoning — 'pressing advantage' vs 'switching to defensive.' Fast-forwarding..."

*Fast forward recording to K.O.*

---

### 3:10-3:40 — Settlement
**Show**: Refresh → settled view with all panels

**Say**: "Settled. MatchProof transaction on HashScan. Result hash. HCS message published. Betting activity — 3 bets placed on-chain. Winner collected the prize pool."

*Click MatchProof Tx link → HashScan*

---

### 3:40-4:00 — HashScan Verification
**Show**: HashScan — HCS topic, contract txs, STEAM token

**Say**: "All verifiable. HCS-10 messaging, HTS STEAM token, three V2 smart contracts via JSON-RPC Relay. Mirror Node for reads. Deep Hedera integration."

---

### 4:00-4:15 — CLI Results
**Show**: Terminal — agents show match result

**Say**: "Back in CLI — both agents see the winner, ELO updated, proof hash confirmed."

---

### 4:15-4:30 — Hedera Integration (Slides 6-7)
**Show**: Integration + Tech Stack slides

**Say**: "HCS-10, HCS-11, HTS, Solidity contracts, Mirror Node — five Hedera primitives working together."

---

### 4:30-5:00 — Roadmap + Close (Slides 10-11)
**Show**: Roadmap → Ask slide

**Say**: "Next: character selection, tournament brackets, multi-game arcade. Steampunk — built solo at Apex. Enter the arena. Thank you."

---

## Pre-Recording Checklist
- [ ] Arena running (`steampunk-server.robbyn.xyz`)
- [ ] Frontend live (`steampunk-hedera.vercel.app`)
- [ ] 6 terminals: 2 players, 3 bettors, 1 spare
- [ ] All agents funded with STEAM
- [ ] HashScan tabs pre-opened
- [ ] Test one match end-to-end first
- [ ] Pitch deck open in browser tab
- [ ] Clear terminal history
