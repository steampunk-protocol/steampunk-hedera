#!/bin/bash
# ============================================================================
# Agent Colosseum — Run Agent
# ============================================================================
# This is what a user runs after installing the colosseum skill.
# It loads their .env.agents, registers on the arena, queues for a match,
# then plays autonomously — reading game state and setting strategy.
#
# Usage (from agent workspace):
#   cd demo/agent-hermes && ../run-agent.sh
#   cd demo/agent-serpens && ../run-agent.sh
# ============================================================================

set -e

# Load agent config from current directory
if [ ! -f .env.agents ]; then
  echo "ERROR: No .env.agents found in current directory."
  echo "Copy .env.agents.example and fill in your agent credentials."
  exit 1
fi

source .env.agents

ARENA="${ARENA_URL:-http://77.237.243.126:8001}"

# Colors
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
R='\033[0;31m'
B='\033[1;34m'
NC='\033[0m'

# Derive EVM address from account ID (simplified — use last segment padded)
AGENT_NUM=$(echo "$AGENT_ACCOUNT_ID" | awk -F. '{print $3}')
AGENT_ADDR="0x$(printf '%040x' "$AGENT_NUM")"

echo -e "${C}╔══════════════════════════════════════════╗${NC}"
echo -e "${C}║  AGENT COLOSSEUM                         ║${NC}"
echo -e "${C}║  ${Y}${AGENT_NAME}${C} (${AGENT_MODEL})${C}$(printf '%*s' $((22 - ${#AGENT_NAME} - ${#AGENT_MODEL})) '')║${NC}"
echo -e "${C}║  Account: ${AGENT_ACCOUNT_ID}$(printf '%*s' $((27 - ${#AGENT_ACCOUNT_ID})) '')║${NC}"
echo -e "${C}╚══════════════════════════════════════════╝${NC}"
echo ""

# --- Step 1: Register ---
echo -e "${C}[${AGENT_NAME}] Registering on arena...${NC}"
REG=$(curl -sf -X POST "$ARENA/agents/register" \
  -H 'Content-Type: application/json' \
  -d "{
    \"address\": \"$AGENT_ADDR\",
    \"name\": \"$AGENT_NAME\",
    \"model_name\": \"$AGENT_MODEL\",
    \"owner_wallet\": \"$AGENT_ADDR\",
    \"hcs_topic_id\": \"${AGENT_HCS_INBOUND_TOPIC:-}\"
  }" 2>/dev/null || echo '{"status":"error"}')
echo -e "  ${G}✓ Registered${NC} (ELO: $(echo "$REG" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("elo",1200))' 2>/dev/null))"
echo ""

# --- Step 2: Queue for match ---
echo -e "${C}[${AGENT_NAME}] Joining matchmaking queue...${NC}"
QUEUE=$(curl -sf -X POST "$ARENA/agents/matches/queue" \
  -H 'Content-Type: application/json' \
  -d "{\"agent_address\": \"$AGENT_ADDR\", \"game\": \"mariokart64\", \"wager\": 0}")

STATUS=$(echo "$QUEUE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)

if [ "$STATUS" = "queued" ]; then
  echo -e "  ${Y}Queued — waiting for opponent...${NC}"
  echo -e "  ${Y}(Another agent needs to run this same script)${NC}"
  echo ""

  # Poll until matched
  while true; do
    sleep 2
    MATCHES=$(curl -sf "$ARENA/matches?limit=5" 2>/dev/null)
    MATCH_ID=$(echo "$MATCHES" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    agents = [a.lower() for a in m.get('agents', [])]
    if '${AGENT_ADDR}'.lower() in agents and m['status'] in ('pending', 'in_progress'):
        print(m['match_id'])
        break
" 2>/dev/null)
    if [ -n "$MATCH_ID" ]; then
      echo -e "  ${G}✓ Match found: ${MATCH_ID}${NC}"
      break
    fi
    echo -ne "\r  Waiting for opponent... "
  done
elif [ "$STATUS" = "matched" ]; then
  MATCH_ID=$(echo "$QUEUE" | python3 -c 'import sys,json; print(json.load(sys.stdin)["match_id"])' 2>/dev/null)
  echo -e "  ${G}✓ Matched! ${MATCH_ID}${NC}"
else
  echo -e "  ${R}Queue failed: $QUEUE${NC}"
  exit 1
fi
echo ""

# --- Step 3: Start match (first caller wins, second is no-op) ---
echo -e "${C}[${AGENT_NAME}] Starting match...${NC}"
curl -sf -X POST "$ARENA/matches/$MATCH_ID/start?game_type=mariokart64" > /dev/null 2>&1 || true
echo -e "  ${G}✓ Match running${NC}"
echo -e "  ${B}Watch: http://localhost:3060/matches/$MATCH_ID${NC}"
echo ""

sleep 2

# --- Step 4: Autonomous strategy loop ---
echo -e "${Y}[${AGENT_NAME}] Entering autonomous strategy loop...${NC}"
echo -e "  Reading game state → Deciding strategy → Sending to arena"
echo ""

ROUND=0
while true; do
  ROUND=$((ROUND + 1))

  # Read game state
  STATE=$(curl -sf "$ARENA/matches/$MATCH_ID/state" 2>/dev/null)
  if [ -z "$STATE" ]; then
    echo -e "${R}[${AGENT_NAME}] No state — match may have ended${NC}"
    break
  fi

  RACE_STATUS=$(echo "$STATE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("race_status",""))' 2>/dev/null)
  if [ "$RACE_STATUS" = "finished" ] || [ -z "$RACE_STATUS" ]; then
    echo -e "${G}[${AGENT_NAME}] Race finished!${NC}"
    break
  fi

  # Parse my state
  MY_POS=$(echo "$STATE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('players', []):
    if p['agent_id'].lower() == '${AGENT_ADDR}'.lower():
        print(f\"P{p['position']} Lap {p['lap']}/{p['total_laps']} {p['speed']:.0f}km/h\")
        break
else:
    print('not found')
" 2>/dev/null)

  # Simple AI decision logic
  POSITION=$(echo "$STATE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('players', []):
    if p['agent_id'].lower() == '${AGENT_ADDR}'.lower():
        print(p['position'])
        break
else:
    print(1)
" 2>/dev/null)

  # Strategy decision based on position
  if [ "$POSITION" = "1" ]; then
    STRAT="defensive"
    REASON="In the lead — protecting position, safe racing lines"
  elif [ "$POSITION" = "2" ]; then
    STRAT="aggressive"
    REASON="Close to the lead — pushing hard to overtake"
  else
    STRAT="item_focus"
    REASON="Behind the pack — hoarding items for a comeback"
  fi

  # Vary strategy occasionally
  if [ $((ROUND % 4)) -eq 0 ]; then
    STRAT="aggressive"
    REASON="Timed push — going all out this window"
  fi

  echo -e "${C}[${AGENT_NAME}] ${MY_POS:-?}${NC}"
  echo -e "  ${Y}→ Strategy: $(echo $STRAT | tr 'a-z' 'A-Z')${NC} — \"${REASON}\""

  # Send strategy
  RESULT=$(curl -sf -X POST "$ARENA/matches/$MATCH_ID/strategy" \
    -H 'Content-Type: application/json' \
    -d "{
      \"agent_id\": \"${AGENT_ADDR}\",
      \"strategy\": \"$STRAT\",
      \"target\": \"leader\",
      \"item_policy\": \"immediate\",
      \"reasoning\": \"$REASON\"
    }" 2>/dev/null)

  ACCEPTED=$(echo "$RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)
  if [ "$ACCEPTED" = "strategy_accepted" ]; then
    echo -e "  ${G}✓ Accepted${NC}"
  else
    echo -e "  ${R}✗ Rate limited or error${NC}"
  fi
  echo ""

  sleep 5
done

# --- Final result ---
echo ""
echo -e "${C}[${AGENT_NAME}] Match result:${NC}"
FINAL=$(curl -sf "$ARENA/agents/matches/$MATCH_ID" 2>/dev/null)
WINNER=$(echo "$FINAL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("winner","none"))' 2>/dev/null)
MY_WINNER=$([ "$WINNER" = "$AGENT_ADDR" ] || [ "$(echo $WINNER | tr 'A-Z' 'a-z')" = "$(echo $AGENT_ADDR | tr 'A-Z' 'a-z')" ])

if echo "$WINNER" | grep -qi "$(echo $AGENT_ADDR | tail -c 10)"; then
  echo -e "  ${G}🏆 ${AGENT_NAME} WINS!${NC}"
else
  echo -e "  ${Y}${AGENT_NAME} finished. Winner: $(echo $WINNER | head -c 12)...${NC}"
fi

echo ""
echo -e "${C}[${AGENT_NAME}] Session complete.${NC}"
