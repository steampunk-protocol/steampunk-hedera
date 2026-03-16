---
title: "MK64 Emulator Pipeline — Emulator on VPS + External Agent Play"
type: feat
status: active
date: 2026-03-16
---

# MK64 Emulator Pipeline — Full End-to-End

## Overview

Get Mario Kart 64 running on the VPS via stable-retro, wire it to the arena server, and enable any external agent (Hermes, Eliza, raw API) to play MK64 matches through HCS-10 negotiation → arena → emulator controller.

**Control model: LLM strategy + rule-based execution.** LLMs set high-level strategy per lap (aggressive, defensive, use items, take shortcuts). Rule-based controller handles 60fps frame-by-frame inputs (steering, acceleration, braking). This is the only realistic approach given LLM latency (~500ms-2s) vs game speed (60fps).

## Problem Statement

The MK64 emulator code is fully ported but never deployed. The arena falls back to either:
- Clash of Wits (RPSLS) strategy game
- MK64GameAdapter stub (synthetic race data)

No real MK64 gameplay has ever run in the Hedera version. External agents have no way to influence MK64 gameplay — the emulator runs agents internally (RuleBasedAgent hardcoded).

## Architecture

```
External Agent (Hermes/any)
  │
  ├── HCS-10 ──→ Matchmaker ──→ match_found
  │                              (or REST /agents/matches/queue)
  │
  ▼
Arena Server (FastAPI, port 8001)
  │
  ├── POST /matches/{id}/start?game_type=mariokart64
  │
  ├── RaceRunner._try_emulator_mode()
  │     └── EmulatorRegistry.get_available("mariokart64")
  │           └── EmulatorConnection.send_start_match()
  │
  ▼
Emulator Service (Python, separate process)
  │
  ├── stable-retro + mupen64plus core
  ├── MarioKart64MultiAgentEnv (N parallel retro instances)
  ├── Xvfb :99 (virtual display)
  │
  ├── Agent Controller (NEW)
  │     ├── Receives strategy commands via WS/REST
  │     ├── Maps strategy → RuleBasedAgent parameters
  │     └── RuleBasedAgent executes frame-by-frame
  │
  ├── Streams EmulatorTickMessage → Arena → Frontend (WS)
  └── Sends EmulatorRaceEndMessage → Arena → Settlement

Settlement Pipeline (unchanged):
  MatchProof.submitResult() + Wager.settle() + ELO + HCS publish
```

## Technical Approach

### Phase 1: Get Emulator Running on VPS

**Goal:** `stable-retro` + MK64 ROM running headlessly, producing real game state.

#### 1.1 Install stable-retro on VPS

```bash
# On VPS (77.237.243.126)
apt-get update && apt-get install -y \
  python3-pip xvfb x11-utils \
  libgl1-mesa-dri libglu1-mesa libegl1-mesa \
  libgles2-mesa-dev mesa-utils cmake zlib1g-dev

pip3 install stable-retro gymnasium
```

**Files:** None — VPS system setup only.

#### 1.2 Import ROM into stable-retro

```bash
# ROM already exists at /opt/steampunk/roms/mario_kart_64.z64
python3 -m retro.import /opt/steampunk/roms/

# Or manually register custom integration:
cp -r emulator/envs/data/MarioKart64-N64 \
  $(python3 -c "import retro; print(retro.data.path())")/
```

**Files:** `emulator/envs/data/MarioKart64-N64/data.json` (RDRAM addresses — UNCONFIRMED)

#### 1.3 Verify RDRAM addresses

The `data.json` addresses are sourced from community research and marked UNCONFIRMED. Must verify:

```bash
# Start Xvfb
Xvfb :99 -screen 0 1280x720x24 +extension GLX &
export DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1

# Run verification script
python3 -c "
import retro
env = retro.make('MarioKart64-N64', render_mode='rgb_array')
obs, info = env.reset()
print('Initial state:', info)
# Step a few frames and check values change sensibly
for i in range(300):
    obs, rew, done, trunc, info = env.step(env.action_space.sample())
    if i % 60 == 0:
        print(f'Frame {i}: pos={info.get(\"position\")}, lap={info.get(\"lap\")}, speed={info.get(\"speed\")}')
env.close()
"
```

If addresses are wrong → fix `data.json` using Hack64 wiki addresses + trial/error.

**Expected performance:** 8-15 FPS on Contabo VPS (CPU-only, llvmpipe software renderer). Acceptable for match play, not for training.

#### 1.4 Test multi-agent env

```bash
# Verify 2-player works
python3 emulator/envs/mariokart64_multi.py  # if it has a __main__ test
```

**Files:** `emulator/envs/mariokart64_multi.py`, `emulator/envs/mariokart64_retro.py`

**Risk:** Multi-agent uses N parallel retro instances (one per player), each running a separate mupen64plus process. On a 4-core VPS, 2 simultaneous N64 emulators might thrash. May need to limit to 2 players max.

---

### Phase 2: Wire Emulator to Arena

**Goal:** Emulator service connects to arena via WS, arena dispatches matches to it.

#### 2.1 Deploy emulator service on VPS

The emulator is a **separate Python process** from the arena. It connects outbound to the arena WS.

```bash
# rsync emulator code to VPS
rsync -avz emulator/ root@77.237.243.126:/opt/steampunk-emulator/

# On VPS: install emulator deps
cd /opt/steampunk-emulator
pip3 install -r requirements.txt

# Run emulator service
export ARENA_WS_URL=ws://localhost:8001
export EMULATOR_ID=emu-001
Xvfb :99 -screen 0 1280x720x24 +extension GLX &
export DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1
python3 -m emulator.main
```

**Files:**
- `emulator/main.py:79-114` — `_connect_and_serve()`, connects to `{ARENA_WS_URL}/emulator/ws`
- `arena/ws/emulator_bridge.py:35-76` — `EmulatorConnection`, receives ticks, signals race_end

#### 2.2 Ensure arena has emulator WS endpoint

The arena already has the `/emulator/ws` WebSocket endpoint in `emulator_bridge.py`. Verify it's mounted in `main.py`.

**Files:** `arena/main.py` — check for `@app.websocket("/emulator/ws")` route

#### 2.3 Test emulator → arena connection

```bash
# Terminal 1: Arena (already running as Docker container)
# Terminal 2: Emulator service
python3 -m emulator.main
# Should print: "Connected to arena at ws://localhost:8001/emulator/ws"
# Should print: "Sent emulator_ready (emu-001)"
```

**Files:**
- `arena/race_runner.py:99-141` — `_try_emulator_mode()`, checks `emulator_registry.get_available()`
- `emulator/main.py:95-114` — `_handle_message()`, processes `start_match` command

---

### Phase 3: External Agent Strategy Interface (NEW CODE)

**Goal:** External agents (Hermes, any HTTP client) can influence MK64 gameplay by setting strategy, not controlling individual frames.

#### 3.1 Design the strategy API

```
POST /matches/{match_id}/strategy
Body: {
  "agent_id": "0xABC...",
  "strategy": "aggressive",     // aggressive | defensive | balanced | item_focus
  "target": "leader",           // leader | nearest | none
  "item_policy": "immediate",   // immediate | save_for_straight | save_for_opponent
  "reasoning": "Opponent is 2 laps ahead, need to take risks"
}

Response: {
  "status": "strategy_accepted",
  "current_lap": 2,
  "position": 3,
  "next_strategy_window_ms": 5000
}
```

Strategies map to RuleBasedAgent parameters:

| Strategy | Steering aggression | Item use | Speed priority |
|---|---|---|---|
| `aggressive` | High (cut corners) | Immediate | Max speed |
| `defensive` | Low (safe lines) | Save for defense | Consistent |
| `balanced` | Medium | Context-dependent | Balanced |
| `item_focus` | Medium | Hoard + target leader | Medium |

**Files to create/modify:**
- `arena/main.py` — Add `POST /matches/{match_id}/strategy` endpoint
- `emulator/agents/strategy_controller.py` (NEW) — Maps strategy enum → RuleBasedAgent parameters
- `emulator/agents/rule_based.py` — Add configurable parameters (steering_aggression, item_policy, speed_bias)
- `emulator/main.py` — Accept strategy updates via WS from arena, apply to running agents

#### 3.2 Strategy update flow

```
External Agent
  → POST /matches/{id}/strategy (to arena)
    → Arena forwards via WS to emulator
      → Emulator updates agent's strategy params
        → RuleBasedAgent uses new params for next frames
          → Game state changes reflected in ticks
            → Ticked back to arena → frontend
```

The strategy endpoint is rate-limited: **one strategy update per 5 seconds** per agent. This prevents spam and matches LLM decision cadence.

**Files:**
- `arena/ws/emulator_bridge.py` — Add `send_strategy_update(match_id, agent_id, strategy)` method
- `emulator/ws/internal_schema.py` — Add `StrategyUpdateMessage` schema

#### 3.3 Game state endpoint for agents

External agents need to read game state to make strategy decisions:

```
GET /matches/{match_id}/state
Response: {
  "match_id": "uuid",
  "lap": 2,
  "total_laps": 3,
  "position": 3,
  "speed": 45.2,
  "item_held": "green_shell",
  "opponents": [
    {"agent_id": "0xDEF", "position": 1, "lap": 3, "gap_ms": 4500},
    {"agent_id": "0x123", "position": 2, "lap": 2, "gap_ms": 1200}
  ],
  "track": "luigi_raceway",
  "race_status": "in_progress"
}
```

This is already partially available via the WS tick broadcast, but external agents need a REST polling option.

**Files:**
- `arena/main.py` — Add `GET /matches/{match_id}/state` endpoint
- Pull data from `EmulatorConnection._last_tick` or the WS broadcaster's cached state

---

### Phase 4: Hermes Skill Integration

**Goal:** A Hermes Agent user installs a skill and their agent can join + play MK64 matches.

#### 4.1 Create `colosseum` Hermes skill

```
~/.hermes/skills/colosseum/
├── SKILL.md           # Skill definition
├── tools/
│   ├── colosseum_register.py    # Register agent on arena
│   ├── colosseum_queue.py       # Join matchmaking queue
│   ├── colosseum_strategy.py    # Set game strategy
│   └── colosseum_status.py      # Check match status/ELO
└── references/
    └── strategies.md            # Strategy guide for the LLM
```

**SKILL.md:**
```yaml
---
name: colosseum
description: Compete as an AI agent in Agent Colosseum — play MK64, wager STEAM tokens
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [gaming, web3, hedera]
    category: gaming
    requires_toolsets: [web]
---

# Agent Colosseum

## When to Use
When user wants to compete in Agent Colosseum, play Mario Kart 64 against other AI agents,
or manage their arena profile/ELO.

## Procedure
1. Register on arena: `colosseum_register(arena_url, agent_name)`
2. Join queue: `colosseum_queue(game="mariokart64", wager=100)`
3. Wait for match (poll status)
4. When match starts: read game state, set strategy every 5s
5. When match ends: check result, ELO change, STEAM balance

## Strategy Decision Loop
Every 5 seconds during a match:
1. Read game state (position, lap, speed, item, opponents)
2. Analyze: Am I winning? Losing? Close race?
3. Set strategy: aggressive/defensive/balanced/item_focus
4. Explain reasoning (published to HCS for transparency)
```

**Files:** This lives in the Caduceus/Hermes project, not Steampunk. But the arena API changes live in Steampunk.

#### 4.2 Arena API: agent registration for external agents

Currently agents are pre-registered with hardcoded wallet addresses. Need a public registration flow:

```
POST /agents/register
Body: {
  "name": "SERPENS",
  "framework": "hermes",
  "callback_url": "https://my-agent.example.com/webhook"  // optional
}
Response: {
  "agent_id": "agent-uuid",
  "agent_address": "0x...",  // generated or provided
  "api_key": "ak-...",       // for authenticating subsequent calls
  "elo": 1200
}
```

**Files:** `arena/main.py` — Modify existing `/agents/register` endpoint to support external agents

---

### Phase 5: Docker Compose for Production

**Goal:** Single `docker-compose up` deploys arena + emulator on VPS.

```yaml
# docker-compose.yml
version: '3.8'
services:
  arena:
    build:
      context: .
      dockerfile: arena/Dockerfile
    ports:
      - "8001:8000"
    env_file: .env
    networks:
      - steampunk

  emulator:
    build:
      context: .
      dockerfile: emulator/Dockerfile
    environment:
      - ARENA_WS_URL=ws://arena:8000
      - EMULATOR_ID=emu-001
      - DISPLAY=:99
      - LIBGL_ALWAYS_SOFTWARE=1
      - GALLIUM_DRIVER=llvmpipe
    depends_on:
      - arena
    networks:
      - steampunk

networks:
  steampunk:
    driver: bridge
```

**Files to create:**
- `emulator/Dockerfile` (NEW) — Ubuntu 22.04 + stable-retro + Xvfb + ROM import
- `docker-compose.yml` (NEW) — Arena + Emulator services
- `emulator/entrypoint.sh` (NEW) — Start Xvfb, then run emulator service

---

## Acceptance Criteria

### Functional Requirements
- [x] stable-retro runs MK64 on VPS headlessly (RAM-only mode, no GPU needed)
- [ ] RDRAM addresses verified — position, lap, speed read correctly from running game
- [x] Emulator service connects to arena via WS, registers as available
- [x] Arena dispatches MK64 matches to emulator (RaceRunner._try_emulator_mode works)
- [x] Emulator streams ticks → arena → frontend (real game state visible in UI)
- [x] External agents can POST /matches/{id}/strategy to influence gameplay
- [x] External agents can GET /matches/{id}/state to read game state
- [x] RuleBasedAgent parameters respond to strategy updates
- [x] Settlement pipeline runs after MK64 race end (same as Clash of Wits)
- [ ] Match result published to HCS topic with proof hash

### Non-Functional Requirements
- [x] Emulator runs at ≥8 FPS on Contabo VPS (stub mode: 10 FPS, real mode: TBD pending RDRAM fix)
- [x] Strategy API rate-limited to 1 update per 5s per agent
- [x] Emulator auto-reconnects to arena on disconnect (3s backoff — verified working)
- [ ] Match timeout of 5 minutes if emulator stalls

---

## Implementation Priority

| # | Task | Est. | Dependency | Risk |
|---|---|---|---|---|
| 1 | Install stable-retro on VPS | 30m | None | Medium — pip install may need cmake build |
| 2 | Import ROM + verify addresses | 1-3h | #1 | **HIGH** — addresses may be wrong |
| 3 | Run emulator service on VPS | 30m | #2 | Low — code exists |
| 4 | Verify arena WS endpoint mounted | 15m | #3 | Low |
| 5 | Test emulator → arena → frontend tick flow | 1h | #3, #4 | Medium |
| 6 | Add strategy API endpoint | 1h | #5 | Low |
| 7 | Add strategy controller to emulator | 2h | #6 | Medium — new code |
| 8 | Add game state REST endpoint | 30m | #5 | Low |
| 9 | Make RuleBasedAgent configurable | 1h | #7 | Low |
| 10 | Create emulator Dockerfile | 1h | #2 | Medium |
| 11 | Create docker-compose.yml | 30m | #10 | Low |
| 12 | Build Hermes colosseum skill | 2h | #6, #8 | Low — wraps REST API |

**Critical path:** #1 → #2 → #3 → #5 → #6 → #7

**Total estimate:** ~12h of work. Phase 1-2 (emulator running + wired) is ~5h. Phase 3 (strategy API) is ~4h. Phase 4-5 (Hermes + Docker) is ~3h.

---

## Risk Analysis

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| RDRAM addresses wrong | Blocks everything | **High** | Budget 2h for address hunting. Use Hack64 wiki + live debugging. Fallback: use stub adapter with synthetic state (already works). |
| stable-retro won't install on VPS | Blocks emulator | Medium | Build from source. Fallback: use gym-mupen64plus (wraps standalone mupen64plus binary). |
| VPS too slow (<5 FPS) | Poor demo quality | Medium | Use Angrylion renderer (CPU-only, most compatible). Accept 8-12 FPS. Demo is still visually impressive. |
| Multi-agent crashes VPS | Match failures | Medium | Limit to 2 players. Kill leftover processes between matches. |
| ROM format mismatch | Import fails | Low | Try .z64, .v64, .n64 formats. Tool exists to convert between them. |

---

## References

### Internal
- `emulator/main.py` — EmulatorService WS bridge
- `emulator/agents/rule_based.py` — RuleBasedAgent (frame-by-frame controller)
- `emulator/agents/llm_agent.py` — LLMAgent (hybrid reflex + LLM)
- `emulator/envs/mariokart64_multi.py` — Multi-agent env wrapper
- `emulator/envs/data/MarioKart64-N64/data.json` — RDRAM address map (UNCONFIRMED)
- `arena/ws/emulator_bridge.py` — Arena-side emulator connection handler
- `arena/race_runner.py:99-141` — `_try_emulator_mode()` dispatch logic
- `arena/adapters/mariokart64.py` — MK64GameAdapter (fallback stub)

### External
- [Hack64 MK64 Memory Map](https://hack64.net/wiki/doku.php?id=mario_kart_64:memory_map)
- [TASVideos MK64 Resources](https://tasvideos.org/GameResources/N64/MarioKart64)
- [stable-retro Game Integration Docs](https://stable-retro.farama.org/integration/)
- [Farama stable-retro GitHub](https://github.com/Farama-Foundation/stable-retro)
- [gym-mupen64plus (alternative N64 approach)](https://github.com/bzier/gym-mupen64plus)
- [Mesa llvmpipe docs](https://docs.mesa3d.org/drivers/llvmpipe.html)
