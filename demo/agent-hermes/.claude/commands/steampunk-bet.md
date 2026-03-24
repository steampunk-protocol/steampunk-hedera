# Steampunk Bet

Place a STEAM token bet on a match. Predict which agent wins and earn from the prediction pool.

## Arguments

**Format**: `$ARGUMENTS`

Parse flexibly — examples:
- `50 on P2` → 50 STEAM on player 2 of latest pending match
- `bet on player 2 for 50` → same
- `100 on HERMES` → 100 STEAM on agent named HERMES
- `--match <id> --agent <addr> --amount 50` → explicit

Default amount: 50 STEAM.

## Prerequisites

Check `.env.agents` in current directory. If missing: "Run /steampunk-setup first, then /steampunk-faucet."

Load: AGENT_NAME, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY

Arena: `https://steampunk-server.robbyn.xyz`

## Execution

### Step 1: Find match + resolve agent

Fetch recent matches and find the latest `pending` one:
```bash
MATCHES=$(curl -sf "https://steampunk-server.robbyn.xyz/matches?limit=5")
```

Pick the first `pending` match. If none, use first `in_progress` (warn: may fail).

Get match details:
```bash
MATCH_DATA=$(curl -sf "https://steampunk-server.robbyn.xyz/agents/matches/${MATCH_ID}")
```

Resolve agent from user input:
- "P1" / "player 1" → `agent_details[0]`
- "P2" / "player 2" → `agent_details[1]`
- Name like "HERMES" → find in `agent_details` by name

Show:
```
Match: ${MATCH_ID} — ${agent1_name} vs ${agent2_name}
Betting 50 STEAM on ${chosen_name} (${chosen_address})
```

### Step 2: Place bet immediately

The place-bet script is at the project root under `demo/place-bet.ts`. Find it relative to the current directory:

```bash
# Find the script - check common locations
SCRIPT=""
for p in "../place-bet.ts" "../../demo/place-bet.ts" "../demo/place-bet.ts" "demo/place-bet.ts"; do
  [ -f "$p" ] && SCRIPT="$p" && break
done
```

Run it:
```bash
npx tsx "${SCRIPT}" --dir "$(pwd)" --match "${MATCH_ID}" --agent "${AGENT_ADDR}" --amount ${AMOUNT}
```

**IMPORTANT**: Do NOT try `cast` or any other method. The Hedera JSON-RPC relay doesn't work with standard EVM tools for HTS token operations. Only `place-bet.ts` (which uses `@hashgraph/sdk`) works.

### Step 3: Report

```
=== BET PLACED ===
${BETTOR_NAME}: ${AMOUNT} STEAM on ${AGENT_NAME}
Match: ${MATCH_ID}
Watch: https://steampunk-hedera.vercel.app/matches/${MATCH_ID}
```

If it fails with CONTRACT_REVERT, check if betting window expired.
