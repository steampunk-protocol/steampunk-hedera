# Steampunk Hedera — AI Agent Arcade Build Plan
**Hackathon**: Hedera Hello Future Apex | Deadline: Mar 23, 2026
**Track**: AI & Agents ($40K) + HOL HCS-10 bounty ($8K)
**Source**: `/Users/ammar.robb/Documents/Web3/Steampunk/`

---

## Phase 1: Port Contracts (Days 1–3)

### 1.1 Setup Hedera Foundry config
```bash
cd /Users/ammar.robb/Documents/Web3/hackathons/steampunk-hedera
cp -r /Users/ammar.robb/Documents/Web3/Steampunk/contracts-foundry/src/protocol contracts/src/
forge init --no-commit || true
```

Add to `foundry.toml`:
```toml
[profile.hedera]
rpc_url = "https://testnet.hashio.io/api"
chain_id = 296
```

Set env:
```bash
export HEDERA_TESTNET_RPC="https://testnet.hashio.io/api"
export HEDERA_CHAIN_ID=296
export DEPLOYER_KEY="<funded testnet ECDSA key>"
```

Get testnet HBAR: https://portal.hedera.com (create account, fund via faucet)

### 1.2 Deploy core contracts
```bash
forge script contracts/script/Deploy.s.sol \
  --rpc-url $HEDERA_TESTNET_RPC \
  --private-key $DEPLOYER_KEY \
  --broadcast
```

Contracts to deploy (from `/contracts/src/protocol/`):
- `MatchProof.sol`
- `Wager.sol` — change token decimals: use `1e8` not `1e18`
- `PredictionPool.sol` — same decimal fix

### 1.3 Replace ERC-8004 with HTS NFT agent identity
- Install Hedera SDK: `npm install @hashgraph/sdk`
- Create `contracts/scripts/mintAgentNFT.ts`:
  - `TokenCreateTransaction` (NFT type, 0 decimals)
  - `TokenMintTransaction` per agent (metadata = agent JSON)
- Acceptance: NFT visible at https://hashscan.io/testnet/token/<id>

### 1.4 Verify
- Check txns at https://hashscan.io/testnet
- Confirm `MatchProof`, `Wager`, `PredictionPool` addresses logged

---

## Phase 2: HCS Integration (Days 3–5)

### 2.1 Create HCS topic for match events
```typescript
import { TopicCreateTransaction, Client } from "@hashgraph/sdk";
const client = Client.forTestnet().setOperator(ACCOUNT_ID, PRIVATE_KEY);
const tx = await new TopicCreateTransaction().execute(client);
const receipt = await tx.getReceipt(client);
const MATCH_TOPIC_ID = receipt.topicId.toString(); // e.g. 0.0.XXXXXX
```
Save `MATCH_TOPIC_ID` to `.env`.

### 2.2 Integrate HOL HCS-10 agent registry
```bash
npm install @hashgraph-online/standards-sdk
```

Register each AI agent on HCS-10:
```typescript
import { HCS10Client } from "@hashgraph-online/standards-sdk";
const hcs10 = new HCS10Client({ client, network: "testnet" });
await hcs10.registerAgent({ name: "Mario", capabilities: ["game-play"] });
```

Reference: https://github.com/hashgraph-online/standards-sdk

### 2.3 Arena server publishes match events to HCS
In `/arena/` FastAPI server, add `hedera_publisher.py`:
```python
# On match end, publish to HCS topic
import subprocess
# Call Node.js script or use hedera-sdk-py
# Message: JSON { match_id, winner, scores, timestamp }
```

Or use Node.js sidecar (`hcs-publisher.ts`) called via `subprocess`.

### 2.4 Frontend subscribes to HCS topic
```typescript
import { TopicMessageQuery } from "@hashgraph/sdk";
new TopicMessageQuery()
  .setTopicId(MATCH_TOPIC_ID)
  .subscribe(client, null, (message) => {
    const event = JSON.parse(Buffer.from(message.contents).toString());
    // update React state
  });
```

Acceptance: Match events appear in UI within 3–5s of arena completion.

---

## Phase 3: Port Arena + Frontend (Days 5–8)

### 3.1 Port FastAPI arena server
```bash
cp -r /Users/ammar.robb/Documents/Web3/Steampunk/arena arena/
```
- Update `arena/config.py`: set `RPC_URL = HEDERA_TESTNET_RPC`, `CHAIN_ID = 296`
- Update contract addresses to Hedera testnet deployments
- Add HCS publish call on match completion (from Phase 2.3)
- Run: `uvicorn arena.main:app --reload --port 8000`

### 3.2 Port Next.js frontend
```bash
cp -r /Users/ammar.robb/Documents/Web3/Steampunk/frontend frontend/
cd frontend && npm install
```
- Update `frontend/.env.local`:
  ```
  NEXT_PUBLIC_RPC_URL=https://testnet.hashio.io/api
  NEXT_PUBLIC_CHAIN_ID=296
  NEXT_PUBLIC_MATCH_TOPIC_ID=0.0.XXXXXX
  ```
- Replace any Ethereum mainnet/testnet references with Hedera testnet
- Wallet: MetaMask works via JSON-RPC Relay — no HashPack required for MVP
  - Add Hedera testnet to MetaMask: RPC `https://testnet.hashio.io/api`, Chain ID 296, Symbol HBAR

### 3.3 Wire HCS live updates in frontend
- Add `useHCSFeed` hook that runs `TopicMessageQuery` subscription
- Display match events in real-time feed panel on arena page

Acceptance: Full flow — arena match runs → HCS message published → frontend updates without refresh.

---

## Phase 4: Polish + Submit (Days 9–11)

### 4.1 Deploy live demo
```bash
# Frontend to Vercel
cd frontend && vercel --prod

# Arena server to Contabo VPS
ssh -i ~/.ssh/id_ed25519 root@77.237.243.126
# deploy via Docker + Coolify at https://coolify.robbyn.xyz
```

### 4.2 README
Must include:
- Architecture diagram (ASCII ok)
- Hedera integration section: HCS topic ID, HTS NFT token ID, contract addresses
- How to run locally

### 4.3 Pitch deck (PDF, ≤15 slides)
Cover: problem, solution, Hedera integration, HCS-10 agent comm, live demo screenshot, market

### 4.4 Demo video (≤5 min, YouTube unlisted)
Script:
1. Show agents registered on HCS-10 (HCS topic)
2. Start arena match
3. Match events stream to HCS in real-time
4. Show match result on-chain (Hedera explorer)
5. Show wager payout + HTS NFT agent identity

### 4.5 Submit
URL: https://dorahacks.io (check for Hedera Hello Future Apex submission portal)
Required: GitHub link, README, pitch deck PDF, demo video URL, live demo URL

---

## Key References
- Hedera Testnet RPC: `https://testnet.hashio.io/api` (Chain ID 296)
- Hedera Explorer: https://hashscan.io/testnet
- Hedera Portal (faucet): https://portal.hedera.com
- HOL Standards SDK: https://github.com/hashgraph-online/standards-sdk
- HCS-10 spec: https://hips.hedera.com/hip/hip-991

## Decimal Note
HTS tokens use 8 decimals. Replace all `1e18` with `1e8` in Wager/PredictionPool contracts and frontend formatting.
