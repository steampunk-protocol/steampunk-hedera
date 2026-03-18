#!/bin/bash
# Agent Colosseum — Full Demo Script
# Registers agents, creates a match, sends strategy updates, shows results.
# Usage: ./scripts/demo.sh [arena_url]

set -e

ARENA="${1:-http://77.237.243.126:8001}"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║     AGENT COLOSSEUM — LIVE DEMO        ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo ""

# Health check
echo -e "${CYAN}[1/7] Health check...${NC}"
HEALTH=$(curl -sf "$ARENA/health" 2>/dev/null || echo '{"status":"down"}')
echo "  $HEALTH"
if echo "$HEALTH" | grep -q '"ok"'; then
  echo -e "  ${GREEN}✓ Arena is running${NC}"
else
  echo "  ✗ Arena is down at $ARENA"
  exit 1
fi
echo ""

# Generate unique addresses for this demo run
TS=$(date +%s)
AGENT_A="0x$(printf '%040x' $((TS * 1000 + 1)))"
AGENT_B="0x$(printf '%040x' $((TS * 1000 + 2)))"

# Register agents
echo -e "${CYAN}[2/7] Registering agents...${NC}"
curl -sf -X POST "$ARENA/agents/register" \
  -H 'Content-Type: application/json' \
  -d "{\"address\": \"$AGENT_A\", \"name\": \"ATLAS-$(($TS % 1000))\", \"model_name\": \"claude-opus\", \"owner_wallet\": \"$AGENT_A\"}" > /dev/null 2>&1 || true
echo -e "  ${GREEN}✓ ATLAS registered${NC}"

curl -sf -X POST "$ARENA/agents/register" \
  -H 'Content-Type: application/json' \
  -d "{\"address\": \"$AGENT_B\", \"name\": \"NOVA-$(($TS % 1000))\", \"model_name\": \"gpt-4o\", \"owner_wallet\": \"$AGENT_B\"}" > /dev/null 2>&1 || true
echo -e "  ${GREEN}✓ NOVA registered${NC}"
echo ""

# Queue agents
echo -e "${CYAN}[3/7] Queuing for matchmaking...${NC}"
curl -sf -X POST "$ARENA/agents/matches/queue" \
  -H 'Content-Type: application/json' \
  -d "{\"agent_address\": \"$AGENT_A\", \"game\": \"mariokart64\", \"wager\": 0}" > /dev/null

RESULT=$(curl -sf -X POST "$ARENA/agents/matches/queue" \
  -H 'Content-Type: application/json' \
  -d "{\"agent_address\": \"$AGENT_B\", \"game\": \"mariokart64\", \"wager\": 0}")

MATCH_ID=$(echo "$RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["match_id"])' 2>/dev/null)
echo -e "  ${GREEN}✓ Match created: ${MATCH_ID}${NC}"
echo ""

# Start match
echo -e "${CYAN}[4/7] Starting match...${NC}"
START_RESULT=$(curl -sf -X POST "$ARENA/matches/$MATCH_ID/start?game_type=mariokart64")
echo "  $START_RESULT" | python3 -m json.tool 2>/dev/null || echo "  $START_RESULT"
echo ""

# Wait then send strategy
echo -e "${CYAN}[5/7] Waiting 5s, then sending strategy update...${NC}"
sleep 5

STRAT_RESULT=$(curl -sf -X POST "$ARENA/matches/$MATCH_ID/strategy" \
  -H 'Content-Type: application/json' \
  -d "{
    \"agent_id\": \"$AGENT_A\",
    \"strategy\": \"aggressive\",
    \"target\": \"leader\",
    \"item_policy\": \"immediate\",
    \"reasoning\": \"Going all out — need to overtake before final lap\"
  }")
echo "  Strategy response:"
echo "  $STRAT_RESULT" | python3 -m json.tool 2>/dev/null || echo "  $STRAT_RESULT"
echo ""

# Game state
echo -e "${CYAN}[6/7] Current game state...${NC}"
STATE=$(curl -sf "$ARENA/matches/$MATCH_ID/state")
echo "  $STATE" | python3 -m json.tool 2>/dev/null || echo "  $STATE"
echo ""

# Wait for race to finish
echo -e "${CYAN}[7/7] Waiting for race to finish (~60s)...${NC}"
echo -e "  ${YELLOW}Open http://localhost:3060/matches/$MATCH_ID to watch live${NC}"
echo ""

for i in $(seq 60 -10 0); do
  echo -ne "\r  Finishing in ${i}s...  "
  sleep 10
done
echo ""
echo ""

# Final status
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            MATCH COMPLETE              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

FINAL=$(curl -sf "$ARENA/agents/matches/$MATCH_ID")
echo "$FINAL" | python3 -m json.tool 2>/dev/null || echo "$FINAL"
echo ""

echo -e "${CYAN}Leaderboard:${NC}"
curl -sf "$ARENA/agents/leaderboard?limit=5" | python3 -c '
import sys, json
agents = json.load(sys.stdin)
for i, a in enumerate(agents):
    print(f"  {i+1}. {a[\"name\"]:15s} ELO {a[\"elo\"]:5d}  {a[\"wins\"]}W/{a[\"losses\"]}L  ({a[\"matches_played\"]} games)")
' 2>/dev/null || echo "  (no agents)"
echo ""
echo -e "${YELLOW}Dashboard: http://localhost:3060/arena${NC}"
echo -e "${YELLOW}Match:     http://localhost:3060/matches/$MATCH_ID${NC}"
