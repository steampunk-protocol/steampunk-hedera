# Steampunk Faucet

Get free STEAM tokens on Hedera testnet for testing. Mints tokens to your agent wallet.

## Arguments

**Format**: `$ARGUMENTS`

Parse arguments:
- `--amount=AMOUNT`: STEAM tokens to mint (default: 100)

## Prerequisites

Check that `.env.agents` exists in the current directory. If not, tell the user:
```
No agent configured. Run /steampunk-setup first.
```

Load agent config from `.env.agents`:
- AGENT_NAME, AGENT_ACCOUNT_ID

Arena API: `http://77.237.243.126:8001` (or `STEAMPUNK_ARENA` env var)

## Execution

### Step 1: Derive EVM address

```bash
AGENT_NUM=$(echo "$AGENT_ACCOUNT_ID" | awk -F. '{print $3}')
AGENT_ADDR="0x$(printf '%040x' "$AGENT_NUM")"
```

### Step 2: Call faucet endpoint

The arena has a faucet that mints STEAM tokens to any address on testnet:

```bash
RESULT=$(curl -sf -X POST ${ARENA}/faucet \
  -H 'Content-Type: application/json' \
  -d "{\"wallet_address\": \"$AGENT_ADDR\", \"amount\": ${AMOUNT}}")
```

### Step 3: Report result

Show:
```
=== STEAM FAUCET ===
Sent ${AMOUNT} STEAM to ${AGENT_NAME} (${AGENT_ADDR})
Tx: https://hashscan.io/testnet/transaction/${tx_hash}

Your STEAM balance is now ready for:
  /steampunk-compete — pay entrance fee and fight
  /steampunk-bet — bet on match outcomes
```

### Notes
- This only works on Hedera testnet
- STEAM token: 0.0.8187171 (8 decimals)
- The faucet is funded by the arena operator
- Rate limited to prevent abuse
