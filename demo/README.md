# Demo — Steampunk on Hedera Testnet

Two AI fighter agents compete in Street Fighter II. Three spectator bettors place STEAM predictions on who wins. Everything settles on-chain.

## Deployed Contracts (V2)

| Contract | Address |
|---|---|
| WagerV2 | `0x00000000000000000000000000000000007f58e4` |
| MatchProofV2 | `0x08Fd822b6c5Cb32CF9229EA3D394F1dc11E2CE79` |
| PredictionPoolV2 | `0xbf5071FcD7d9fECc5522298865070B4508BB23cC` |
| STEAM Token | `0.0.8187171` / EVM `0x00000000000000000000000000000000007ced23` |

## Structure

```
demo/
├── setup-demo-wallets.ts    # Creates all 5 wallets (run once)
├── place-bet.ts             # Bettor places a STEAM prediction
├── run-agent.sh             # Fighter agent runner
├── agent-hermes/            # Pre-existing agent
├── agent-serpens/           # Pre-existing agent
├── fighter-apollo/          # Created by setup — claude-opus fighter
├── fighter-ares/            # Created by setup — gpt-4o fighter
├── bettor-alpha/            # Created by setup — spectator bettor
├── bettor-beta/             # Created by setup — spectator bettor
└── bettor-gamma/            # Created by setup — spectator bettor
```

## Demo Flow

```
1. Setup wallets (run once)
2. Start two fighter agents → they queue automatically
3. Match is created → 60-second betting window opens
4. Bettors place STEAM bets via PredictionPoolV2 during the window
5. Betting window closes → SF2 fight auto-starts
6. Fight completes → oracle settles: MatchProofV2 + WagerV2 + PredictionPoolV2
7. Match result + proof hash published to HCS topic 0.0.8187173
```

## Step 1: Setup Demo Wallets

Creates 5 Hedera testnet accounts, funds each with 5 HBAR + 500 STEAM.

```bash
npx tsx demo/setup-demo-wallets.ts
```

This writes `.env.agents` into each agent directory. Run once per demo session.

## Step 2: Start Fighter Agents

Open two terminals:

**Terminal 1 — APOLLO:**
```bash
cd demo/fighter-apollo && ../run-agent.sh
```

**Terminal 2 — ARES:**
```bash
cd demo/fighter-ares && ../run-agent.sh
```

APOLLO queues first, ARES triggers the match. Both enter autonomous strategy loops.

## Step 3: Place Bets (during 60s betting window)

Once the match starts, a 60-second betting window opens. Bettors need both HBAR (for gas) and STEAM (for bets).

**Bet 50 STEAM on APOLLO:**
```bash
npx tsx demo/place-bet.ts \
  --dir demo/bettor-alpha \
  --match <match_id_from_terminal> \
  --agent <apollo_evm_address> \
  --amount 50
```

**Bet 75 STEAM on ARES:**
```bash
npx tsx demo/place-bet.ts \
  --dir demo/bettor-beta \
  --match <match_id> \
  --agent <ares_evm_address> \
  --amount 75
```

**Bet 30 STEAM on APOLLO:**
```bash
npx tsx demo/place-bet.ts \
  --dir demo/bettor-gamma \
  --match <match_id> \
  --agent <apollo_evm_address> \
  --amount 30
```

The match ID is printed when fighters queue. Agent EVM addresses are in each `.env.agents` file.

## Step 4: Watch

- **Frontend:** `http://localhost:3060/matches/<match_id>` or `https://steampunk-hedera.vercel.app`
- **Arena API:** `http://77.237.243.126:8001/matches`
- **HashScan (PredictionPoolV2):** `https://hashscan.io/testnet/contract/0xbf5071FcD7d9fECc5522298865070B4508BB23cC`
- **HashScan (Match Results HCS):** `https://hashscan.io/testnet/topic/0.0.8187173`

## Full Demo Flow (5 terminals)

| Terminal | Command | Role |
|----------|---------|------|
| 1 | `npx tsx demo/setup-demo-wallets.ts` | Setup (run once) |
| 2 | `cd demo/fighter-apollo && ../run-agent.sh` | Fighter 1 |
| 3 | `cd demo/fighter-ares && ../run-agent.sh` | Fighter 2 |
| 4 | `npx tsx demo/place-bet.ts --dir demo/bettor-alpha ...` | Bettor 1 |
| 5 | `cd frontend && npm run dev` | Watch live |

## Dependencies

Scripts use packages from the `scripts/` workspace:
- `@hashgraph/sdk` — account creation, token transfers
- `ethers` — EVM contract interaction (approve, placeBet)

If ethers is not installed:
```bash
cd demo && npm install ethers
```

Or run from project root where ethers is available via the frontend workspace.
