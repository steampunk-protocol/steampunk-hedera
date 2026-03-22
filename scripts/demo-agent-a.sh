#!/bin/bash
# Agent A — "HERMES" (Claude-powered agent)
# Run in Terminal 1. This simulates an external AI agent competing in Agent Colosseum.
# The agent registers, queues, reads game state, and sets strategy every 5 seconds.

set -e

ARENA="${1:-http://77.237.243.126:8001}"
AGENT_ADDR="0xAAAA000000000000000000000000000000000001"
AGENT_NAME="HERMES"
MODEL="claude-opus"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AGENT: ${YELLOW}HERMES${CYAN}  (Claude Opus)       ║${NC}"
echo -e "${CYAN}║   Role: Aggressive Racer             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# Step 1: Register
echo -e "${CYAN}[HERMES] Registering on arena...${NC}"
curl -sf -X POST "$ARENA/agents/register" \
  -H 'Content-Type: application/json' \
  -d "{\"address\": \"$AGENT_ADDR\", \"name\": \"$AGENT_NAME\", \"model_name\": \"$MODEL\", \"owner_wallet\": \"$AGENT_ADDR\"}" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (already registered)"
echo ""

# Step 2: Queue for match
echo -e "${CYAN}[HERMES] Joining matchmaking queue...${NC}"
QUEUE_RESULT=$(curl -sf -X POST "$ARENA/agents/matches/queue" \
  -H 'Content-Type: application/json' \
  -d "{\"agent_address\": \"$AGENT_ADDR\", \"game\": \"mariokart64\", \"wager\": 0}")
echo "  $QUEUE_RESULT" | python3 -m json.tool 2>/dev/null

STATUS=$(echo "$QUEUE_RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)

if [ "$STATUS" = "queued" ]; then
  echo -e "${YELLOW}[HERMES] Waiting for opponent to join...${NC}"
  echo -e "${YELLOW}         → Run demo-agent-b.sh in another terminal${NC}"
  echo ""

  # Poll until matched
  while true; do
    sleep 2
    # Check if a match was created with our agent
    MATCHES=$(curl -sf "$ARENA/matches?status=pending&limit=1" 2>/dev/null)
    MATCH_ID=$(echo "$MATCHES" | python3 -c '
import sys, json
matches = json.load(sys.stdin)
for m in matches:
  if "'"$AGENT_ADDR"'" in m.get("agents", []) or "'"$(echo $AGENT_ADDR | tr 'A-Z' 'a-z')"'" in [a.lower() for a in m.get("agents", [])]:
    print(m["match_id"])
    break
' 2>/dev/null)

    if [ -n "$MATCH_ID" ]; then
      echo -e "${GREEN}[HERMES] Match found: $MATCH_ID${NC}"
      break
    fi

    # Also check in_progress
    MATCHES=$(curl -sf "$ARENA/matches?status=in_progress&limit=1" 2>/dev/null)
    MATCH_ID=$(echo "$MATCHES" | python3 -c '
import sys, json
matches = json.load(sys.stdin)
for m in matches:
  agents_lower = [a.lower() for a in m.get("agents", [])]
  if "'"$(echo $AGENT_ADDR | tr 'A-Z' 'a-z')"'" in agents_lower:
    print(m["match_id"])
    break
' 2>/dev/null)

    if [ -n "$MATCH_ID" ]; then
      echo -e "${GREEN}[HERMES] Match already started: $MATCH_ID${NC}"
      break
    fi

    echo -ne "\r  Waiting for opponent...  "
  done
elif [ "$STATUS" = "matched" ]; then
  MATCH_ID=$(echo "$QUEUE_RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["match_id"])' 2>/dev/null)
  echo -e "${GREEN}[HERMES] Matched immediately: $MATCH_ID${NC}"
fi

echo ""

# Step 3: Start match (first agent to call this wins)
echo -e "${CYAN}[HERMES] Starting match...${NC}"
curl -sf -X POST "$ARENA/matches/$MATCH_ID/start?game_type=mariokart64" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (already started)"
echo ""

sleep 2

# Step 4: Strategy loop — read state, decide, set strategy
echo -e "${YELLOW}[HERMES] Entering strategy loop (every 5s)...${NC}"
echo -e "${YELLOW}         Watch at: http://localhost:3060/matches/$MATCH_ID${NC}"
echo ""

STRATEGIES=("aggressive" "aggressive" "balanced" "aggressive" "item_focus" "aggressive")
REASONINGS=(
  "Starting aggressive — need to establish early lead"
  "Maintaining pressure, cutting corners hard"
  "Switching to balanced — consolidating position"
  "Going all out for the final push"
  "Hoarding items for defensive play near finish"
  "Final sprint — maximum aggression"
)

for i in $(seq 0 11); do
  # Read game state
  STATE=$(curl -sf "$ARENA/matches/$MATCH_ID/state" 2>/dev/null)

  if [ -z "$STATE" ]; then
    echo -e "${RED}[HERMES] Match ended or not found${NC}"
    break
  fi

  RACE_STATUS=$(echo "$STATE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("race_status",""))' 2>/dev/null)

  if [ "$RACE_STATUS" = "finished" ] || [ "$RACE_STATUS" = "" ]; then
    echo -e "${GREEN}[HERMES] Race finished!${NC}"
    break
  fi

  # Parse our state
  MY_STATE=$(echo "$STATE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('players', []):
    if p['agent_id'].lower() == '$(echo $AGENT_ADDR | tr 'A-Z' 'a-z')':
        print(f\"Pos:{p['position']} Lap:{p['lap']}/{p['total_laps']} Speed:{p['speed']:.0f}km/h\")
        break
" 2>/dev/null)

  IDX=$((i % ${#STRATEGIES[@]}))
  STRAT="${STRATEGIES[$IDX]}"
  REASON="${REASONINGS[$IDX]}"

  echo -e "${CYAN}[HERMES] State: ${MY_STATE:-unknown}${NC}"
  echo -e "${YELLOW}[HERMES] Thinking... → Strategy: ${STRAT^^}${NC}"
  echo -e "         \"${REASON}\""

  # Set strategy
  RESULT=$(curl -sf -X POST "$ARENA/matches/$MATCH_ID/strategy" \
    -H 'Content-Type: application/json' \
    -d "{
      \"agent_id\": \"$(echo $AGENT_ADDR | tr 'A-Z' 'a-z')\",
      \"strategy\": \"$STRAT\",
      \"target\": \"leader\",
      \"item_policy\": \"immediate\",
      \"reasoning\": \"$REASON\"
    }" 2>/dev/null)

  ACCEPTED=$(echo "$RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)
  if [ "$ACCEPTED" = "strategy_accepted" ]; then
    echo -e "  ${GREEN}✓ Strategy accepted${NC}"
  else
    echo -e "  ${RED}✗ $RESULT${NC}"
  fi
  echo ""

  sleep 5
done

# Final result
echo ""
echo -e "${CYAN}[HERMES] Checking final result...${NC}"
sleep 2
curl -sf "$ARENA/agents/matches/$MATCH_ID" 2>/dev/null | python3 -m json.tool 2>/dev/null
echo ""
echo -e "${GREEN}[HERMES] Session complete.${NC}"
