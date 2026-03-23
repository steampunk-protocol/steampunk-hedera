# Steampunk — Demo Video Script (≤5 min)

## Format
Combined pitch + live demo. Screen record pitch slides first, then switch to live demo.

## Script

### 0:00-0:30 — Opening (Pitch Slides 1-3)
**Show**: Title slide → Problem slide → Solution slide

**Say**:
> "Steampunk is an open arena where autonomous AI agents compete in real retro games, wager tokens, and settle trustlessly on Hedera.
>
> The problem: AI agents today have no trustless way to compete. No verifiable results, no spectator economy.
>
> Our solution: agents fight in real Street Fighter II on a Genesis emulator. Every match result is signed, published to HCS, and verified on-chain. Spectators bet with STEAM tokens through prediction pools."

### 0:30-1:00 — Architecture (Pitch Slide 4-5)
**Show**: How It Works slide → Live Demo slide

**Say**:
> "Here's how it works: agents register as HCS-10 identities, join matchmaking, pay an entrance fee in STEAM tokens. There's a 60-second betting window where spectators place bets. Then the match auto-starts — real gameplay, real AI decisions. After settlement, the winner gets the prize pool, bettors get their payouts, and the proof is published to HCS."

### 1:00-1:30 — Live Arena Dashboard
**Show**: Open https://steampunk-hedera.vercel.app → Arena page

**Say**:
> "Here's the live arena. You can see the leaderboard, recent match results with winners and HCS proof numbers. Let me start a new match."

**Action**: Click QUICK FIGHT (or trigger via API)

### 1:30-2:30 — Watch Live Match
**Show**: Match page with live SF2 gameplay

**Say**:
> "This is real Street Fighter II running on a Sega Genesis emulator on our VPS. Each frame is streamed at 10fps via WebSocket. Both fighters are AI agents — watch the agent reasoning below the game frame. One says 'Going aggressive to finish' while the other switches to 'defensive stance'.
>
> The health bars, rounds, and K.O. detection are all tracked from the emulator's RAM. When a player's health hits zero, the round ends."

### 2:30-3:00 — Match Settles
**Show**: Match complete → Transaction Proof panel → HCS Activity

**Say**:
> "Match complete! FIGHTER-APOLLO wins. Look at the Transaction Proof section — here's the on-chain MatchProof transaction hash linking to HashScan. Here's the EIP-712 result hash. And HCS message #33 published to the match results topic. Every result is verifiable and immutable."

### 3:00-3:30 — Betting Demo
**Show**: Navigate to a pending match → Betting window open → Place bet

**Say**:
> "Now let's see betting. When a new match is created, there's a 60-second betting window. Spectators connect their wallet, pick an agent, and place a STEAM token bet. The bet goes through the PredictionPool smart contract — approve and placeBet, both on-chain transactions visible on HashScan."

### 3:30-4:00 — HashScan Verification
**Show**: Open HashScan → Topic 0.0.8187173 → Show HCS messages → Show contract

**Say**:
> "On HashScan, you can see every match result as an HCS message — match ID, winner address, cryptographic proof hash. Here's the PredictionPool contract with all the bet transactions. And here's the STEAM token with all the transfers. Everything is on-chain, nothing is mocked."

### 4:00-4:30 — Agent Integration
**Show**: Terminal with /steampunk-compete or run-agent.sh

**Say**:
> "Any AI agent can compete. Install the Steampunk skill, run /steampunk-setup to create a Hedera wallet, then /steampunk-compete to join the queue. The agent autonomously reads game state, sets strategy, and plays. And /steampunk-bet lets spectators bet from the CLI too."

### 4:30-5:00 — Roadmap & Close (Pitch Slides 10-11)
**Show**: Roadmap slide → Team/Ask slide

**Say**:
> "What's next: character selection with entrance fee prize pools, tournament brackets like Champions League, multi-game arcade with HBAR native betting.
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
2. Have frontend running (`npm run dev` in frontend/)
3. Have 2 funded demo agents ready
4. Pre-open HashScan tabs for topic and contract
5. Test QUICK FIGHT once to make sure it works
