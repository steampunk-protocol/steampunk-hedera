---
title: "Final Sprint Brainstorm — 6-10 Hours to Submission"
type: brainstorm
status: active
date: 2026-03-23
deadline: 2026-03-24T00:59:00-04:00
---

# Final Sprint Brainstorm

## Current State (What Works)
- SF2 running on VPS (real Genesis emulator, real gameplay frames streaming)
- Two AI agents (HERMES/SERPENS) fighting with strategy-based decisions
- Health bars, round tracking, K.O. detection, winner announcement
- Arena dashboard with QUICK FIGHT button
- Onboarding modal with skill installation flow
- Skills repo public: github.com/steampunk-protocol/steampunk-skills
- HCS-10 agents registered on Hedera testnet with profiles
- Smart contracts deployed (Wager, MatchProof, PredictionPool)
- STEAM token faucet endpoint + UI button
- Betting panel works (approved + placed on-chain)
- Past match pages show results from REST API

## Problems to Fix (High Impact)

### P1: Character Variety — CRITICAL
**Problem**: Always Ryu vs Guile (one save state)
**Why it matters**: Judges see the same matchup every time — looks like a tech demo, not a platform
**Solutions** (pick one):
1. **Create more save states** — Use the emulator to play through character select, save at different matchups. Need: Ryu vs Ken, Chun-Li vs Dhalsim, Blanka vs E.Honda, etc. Can be done with a script that inputs the right button sequence to navigate character select.
2. **Boot from State.NONE + menu navigation** — Start from ROM boot, automate character select with timed button presses. Complex but gives random characters every match.
3. **Random save state selection** — Create 4-5 save states, randomly pick one per match. Best ROI if we can create the states.

**Approach**: Option 3. Create save states by running the emulator interactively once (can do via Xvfb + VNC on VPS or locally), save at different character screens. Then randomize in `_run_sf2_match()`.

### P2: On-Chain Transaction List on Match Page — HIGH
**Problem**: No visible proof of on-chain activity. "Bet Placed!" shows but no tx hash, no link to HashScan.
**Why it matters**: Integration (15%) judging criteria asks "to what degree does the project use Hedera". Showing tx hashes on the match page proves real on-chain activity.
**Solution**:
- After bet placement, show tx hash with HashScan link
- On match detail, show list of on-chain events: wager deposit, bet placed, settlement tx, HCS message
- Pull from mirror node: `/api/v1/transactions?account.id=0.0.XXXXX`
- Or track in DB: store tx hashes when settlement runs

### P3: HCS Activity Feed on Match Page — MEDIUM
**Problem**: "ON-CHAIN ACTIVITY" section says "HCS messages will appear when match starts" but never populates
**Why it matters**: Shows HCS integration is real
**Solution**: The settlement pipeline publishes to HCS_MATCH_RESULTS_TOPIC. Wire the feed to show messages from that topic filtered by match_id.

## Features to Add (Nice to Have)

### F1: Agent Strategy Reasoning in UI
**Problem**: Agents make strategy decisions but reasoning isn't shown in the match viewer
**Why it matters**: This is the "AI" part of "AI & Agents" — judges need to see agents thinking
**Solution**:
- When SF2Agent decides a move category (approach/attack/block/special/retreat), log it as reasoning
- Send via AgentReasoningMessage over WS
- FightViewer already has reasoning display section — just needs data

### F2: Match Replay / Past Match Game Frames
**Problem**: Past match pages show "Match Complete" text, no game footage
**Why it matters**: Judges clicking past matches see nothing interesting
**Solution**: Store last frame of each match in DB or as static file. Show on past match page.

### F3: Per-Match Chat (Twitch-style)
**Problem**: Chat is global to matchmaker, not per-match
**Why it matters**: Would show spectator engagement + on-chain social
**Solution**: Each match gets an HCS topic. Spectators post to it. Display in match viewer sidebar.
**Verdict**: Too complex for this sprint. Mention in roadmap.

### F4: Tournament Bracket
**Problem**: Only 1v1 matches, no tournament view
**Why it matters**: Would be very impressive visually
**Solution**: Register 8 agents, run single elimination, bracket UI
**Verdict**: 4+ hours. Only if time permits after P1-P3.

### F5: HBAR Betting Instead of STEAM
**Problem**: Nobody has STEAM tokens without faucet
**Why it matters**: Removes friction for spectators
**Solution**: Would require rewriting PredictionPool.sol to accept native HBAR via `msg.value`
**Verdict**: Contract rewrite too risky. Keep STEAM + faucet button.

## Judging Criteria Gaps

### Innovation (10%) — STRONG
✅ AI agents competing in real retro games on Hedera — novel
✅ Strategy API (LLM decides strategy, rule-based executes) — unique approach
⚠️ Need to emphasize this in pitch deck

### Feasibility (10%) — STRONG
✅ Working MVP deployed
✅ Clearly needs Web3 (trustless settlement, verifiable results)
⚠️ No Business Model Canvas — add to pitch deck

### Execution (20%) — MEDIUM
✅ Full MVP with important features
✅ Real emulator running real game
⚠️ Character variety missing (P1)
⚠️ UX could be more polished
⚠️ Need GTM strategy in pitch deck

### Integration (15%) — STRONG
✅ HCS-10 agent messaging
✅ HCS-11 agent profiles
✅ HTS STEAM token
✅ 3 smart contracts via JSON-RPC Relay
✅ Mirror Node for reads
⚠️ Need visible on-chain proof in UI (P2)

### Success (20%) — WEAK
⚠️ No real users yet
⚠️ No account creation metrics
⚠️ Need to frame: "each agent = new Hedera account, each match = N HCS messages + token transfers"

### Validation (15%) — WEAK
⚠️ No market feedback
⚠️ No user testing
⚠️ Add to pitch: "target market is AI agent developers, gaming communities"

### Pitch (10%) — NEEDS WORK
⚠️ Pitch deck exists but needs updating with SF2 screenshots
⚠️ Demo video NOT RECORDED — CRITICAL BLOCKER
⚠️ Need clear problem/solution narrative

## Priority Order for Next Session

### Must Do (blocks submission)
1. **Record demo video** (1 hour) — screen record QUICK FIGHT + explain architecture
2. **Print pitch deck to PDF** (15 min) — update with SF2 screenshots first
3. **Make main repo public** (1 min) — GitHub settings
4. **Deploy final Vercel** (5 min)
5. **Fill submission form** (20 min) — copy from SUBMISSION_FORM.md

### Should Do (improves score significantly)
6. **Character variety** (2-3 hours) — create 4-5 save states, randomize per match
7. **On-chain tx list on match page** (1-2 hours) — show HashScan links for bets/settlement
8. **Agent reasoning in UI** (1 hour) — show strategy decisions in match viewer
9. **Update pitch deck** (30 min) — add BMC, GTM, SF2 screenshots

### Could Do (if time permits)
10. **HCS feed on match page** (1 hour) — wire to match results topic
11. **Past match frames** (30 min) — store/show last frame
12. **Tournament bracket** (4 hours) — 8-agent single elimination

## Technical Notes for Next Session

### VPS State
- Arena: `steampunk-arena` container on 77.237.243.126:8001, coolify network
- Emulator: `steampunk-emulator` container, same VPS, connected to arena
- ROMs mounted at `/opt/steampunk/game/` (SF2 + MK2 Genesis)
- Arena env at `/tmp/arena-env.txt`

### To create SF2 save states
Option A: Use VNC on VPS
```bash
# Install VNC on VPS
apt install x11vnc
Xvfb :99 -screen 0 800x600x24 &
x11vnc -display :99 -nopw &
# Connect VNC viewer to VPS:5900
# Run emulator with display, navigate menus, save states
```

Option B: Create states via scripted button inputs
```python
# In sf2_retro.py, add a create_save_state() method:
# Boot from State.NONE, press buttons to navigate character select
# Save state at fight start for each character combo
env = retro.make("StreetFighterIISpecialChampionEdition-Genesis-v0", state=retro.State.NONE)
# Frame 1-30: Press START to skip intro
# Frame 31-60: Navigate to 2P mode
# Frame 61-90: Select characters
# env.em.get_state() → save to .state file
```

### Git State
- Branch: `main` (merged from feat/agent-colosseum)
- Skills repo: github.com/steampunk-protocol/steampunk-skills (public)
- Main repo: github.com/steampunk-protocol/steampunk-hedera (NEEDS TO BE MADE PUBLIC)

### Frontend
- Dev: localhost:3060
- Vercel: needs redeployment after latest changes
- Theme config: frontend/src/config/theme.ts
- Arena API: proxied via Next.js rewrites → 77.237.243.126:8001
