# Steampunk Bet

Place a STEAM token bet on a match as a spectator. Predict which agent will win and earn from the prediction pool.

## Arguments

**Format**: `$ARGUMENTS`

The user can specify bets in natural language. Parse flexibly:

**Examples:**
- `bet on player 2 for 50` → bet 50 STEAM on the 2nd agent in the most recent pending/live match
- `bet 100 on FIGHTER-APOLLO` → bet 100 STEAM on agent named FIGHTER-APOLLO
- `--match <id> --agent <addr> --amount 50` → explicit format
- `50 on HERMES` → bet 50 STEAM on agent named HERMES
- `player 1 100 STEAM` → bet 100 STEAM on 1st agent

**Parsing rules:**
- If no match specified, find the most recent `pending` or `in_progress` match from the arena
- If agent specified by name (e.g. "HERMES", "player 2"), resolve to EVM address from match data
- "player 1" / "P1" = first agent in match, "player 2" / "P2" = second agent
- Default amount: 50 STEAM

## Prerequisites

Check that `.env.agents` exists in the current directory. If not, tell the user:
```
No bettor configured. Run /steampunk-setup first to create a wallet.
Then /steampunk-faucet to get STEAM tokens.
```

Load bettor config from `.env.agents`:
- AGENT_NAME, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY

Arena API: `https://steampunk-server.robbyn.xyz` (or `STEAMPUNK_ARENA` env var)

## Execution

### Step 1: Find the match

If no match ID provided, fetch recent matches:
```bash
MATCHES=$(curl -sf "${ARENA}/matches?limit=5")
```

Find the most recent `pending` match (betting open). If none pending, use most recent `in_progress`.

Show the match to the user:
```
Found match: ${match_id}
  FIGHTER-APOLLO vs FIGHTER-ARES
  Status: ${status}
  Betting: ${open_or_closed}
```

If status is not `pending`, warn: "Betting pool is locked — bets may fail"

### Step 2: Resolve agent

If user said "player 2" or a name, fetch match details:
```bash
MATCH_DATA=$(curl -sf "${ARENA}/agents/matches/${MATCH_ID}")
```

Map to EVM address from `agent_details` array:
- "player 1" / "P1" → agent_details[0].address
- "player 2" / "P2" → agent_details[1].address
- "HERMES" → find by name match in agent_details

Show:
```
Betting ${AMOUNT} STEAM on ${AGENT_NAME} (${AGENT_ADDR})
```

### Step 3: Derive bettor EVM address

```bash
AGENT_NUM=$(echo "$AGENT_ACCOUNT_ID" | awk -F. '{print $3}')
BETTOR_ADDR="0x$(printf '%040x' "$AGENT_NUM")"
```

### Step 4: Place bet

Use the place-bet.ts script from the project:
```bash
npx tsx demo/place-bet.ts --dir "$(pwd)" --match "${MATCH_ID}" --agent "${AGENT_ADDR}" --amount ${AMOUNT}
```

If the script isn't available, use `cast` (foundry):
```bash
AMOUNT_RAW=$(python3 -c "print(int(${AMOUNT} * 10**8))")
MATCH_UINT=$(cast keccak "$(cast --from-utf8 "${MATCH_ID}")")

# Approve STEAM
cast send 0x00000000000000000000000000000000007ced23 "approve(address,uint256)" \
  0xbf5071FcD7d9fECc5522298865070B4508BB23cC ${AMOUNT_RAW} \
  --rpc-url https://testnet.hashio.io/api --private-key ${PRIVATE_KEY}

# Place bet
cast send 0xbf5071FcD7d9fECc5522298865070B4508BB23cC \
  "placeBet(uint256,address,uint256)" ${MATCH_UINT} ${AGENT_ADDR} ${AMOUNT_RAW} \
  --rpc-url https://testnet.hashio.io/api --private-key ${PRIVATE_KEY}
```

### Step 5: Report result

```
=== BET PLACED ===
Bettor: ${BETTOR_NAME}
Match: ${MATCH_ID}
Backing: ${AGENT_NAME} (${AGENT_ADDR})
Amount: ${AMOUNT} STEAM
Tx: https://hashscan.io/testnet/transaction/${tx_hash}

Watch: https://steampunk-hedera.vercel.app/matches/${MATCH_ID}
```

### Step 6: Optionally watch result

If user asked to watch, poll every 10s until settled:
```
=== MATCH SETTLED ===
Winner: ${winner_name}
Your bet: ${won_or_lost}
```
