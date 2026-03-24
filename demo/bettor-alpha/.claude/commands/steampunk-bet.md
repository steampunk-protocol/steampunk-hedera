# Steampunk Bet

Place a STEAM token bet on a match as a spectator. Predict which agent will win and earn from the prediction pool.

## Arguments

**Format**: `$ARGUMENTS`

Parse arguments:
- `--match=MATCH_ID`: match ID to bet on (required)
- `--agent=AGENT_ADDR`: EVM address of agent to back (required)
- `--amount=AMOUNT`: STEAM tokens to bet (default: 50)

## Prerequisites

Check that `.env.agents` exists in the current directory. If not, tell the user:
```
No bettor configured. Create a .env.agents file with AGENT_NAME, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY.
```

Load bettor config from `.env.agents`:
- AGENT_NAME, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY

Constants:
- Arena API: `http://77.237.243.126:8001` (or `STEAMPUNK_ARENA` env var)
- RPC URL: `https://testnet.hashio.io/api`
- STEAM Token EVM: `0x00000000000000000000000000000000007ced23`
- PredictionPool: `0xdCC851392396269953082b394B689bfEB8E13FD5`
- STEAM decimals: 8
- HashScan: `https://hashscan.io/testnet`

## Execution

### Step 1: Derive EVM address and private key

```bash
AGENT_NUM=$(echo "$AGENT_ACCOUNT_ID" | awk -F. '{print $3}')
BETTOR_ADDR="0x$(printf '%040x' "$AGENT_NUM")"
```

### Step 2: Check match exists and pool is open

```bash
MATCH_DATA=$(curl -sf "${ARENA}/agents/matches/${MATCH_ID}")
```

Show match info:
```
Match: ${MATCH_ID}
Status: ${status}
Agents: ${agent_details}
```

If match not found or pool not open, warn user.

### Step 3: Place bet using the place-bet.ts script

The bet script is at `demo/place-bet.ts` relative to the project root.

```bash
npx tsx demo/place-bet.ts --dir "$(pwd)" --match "${MATCH_ID}" --agent "${AGENT_ADDR}" --amount ${AMOUNT}
```

If the script isn't available or deps aren't installed, fall back to using `cast` (foundry):

```bash
# Approve STEAM
AMOUNT_RAW=$(python3 -c "print(int(${AMOUNT} * 10**8))")
cast send ${STEAM_TOKEN} "approve(address,uint256)" ${PREDICTION_POOL} ${AMOUNT_RAW} \
  --rpc-url ${RPC_URL} --private-key ${PRIVATE_KEY}

# Convert match ID to uint256: keccak256(abi.encodePacked(matchId))
MATCH_UINT=$(cast keccak "$(cast --from-utf8 "${MATCH_ID}")")

# Place bet
cast send ${PREDICTION_POOL} "placeBet(uint256,address,uint256)" ${MATCH_UINT} ${AGENT_ADDR} ${AMOUNT_RAW} \
  --rpc-url ${RPC_URL} --private-key ${PRIVATE_KEY}
```

### Step 4: Report result

Show:
```
=== BET PLACED ===
Bettor: ${AGENT_NAME}
Match: ${MATCH_ID}
Backing: ${AGENT_ADDR}
Amount: ${AMOUNT} STEAM
Approve Tx: ${approve_hash} → https://hashscan.io/testnet/transaction/${approve_hash}
Bet Tx: ${bet_hash} → https://hashscan.io/testnet/transaction/${bet_hash}

Watch the match: https://steampunk-hedera.vercel.app/matches/${MATCH_ID}
```

### Step 5: Optionally wait for result

If `--watch` flag is set, poll match status every 5 seconds until settled, then show:
```
=== MATCH SETTLED ===
Winner: ${winner}
Your bet: ${won_or_lost}
Pool payout: ${payout} STEAM
```
