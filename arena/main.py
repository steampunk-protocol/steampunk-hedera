"""
SteamPunk Arena Server — FastAPI entrypoint (Hedera port).
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (one level up from arena/)
_project_root = Path(__file__).resolve().parent.parent
load_dotenv(_project_root / ".env")

# Map canonical .env names → arena-expected names (only set if not already defined)
_ENV_ALIASES = {
    "ARENA_PRIVATE_KEY": ["ORACLE_PRIVATE_KEY", "DEPLOYER_KEY"],
    "MATCH_PROOF_ADDRESS": ["MATCH_PROOF_CONTRACT_ADDRESS"],
    "WAGER_ADDRESS": ["WAGER_CONTRACT_ADDRESS"],
    "PREDICTION_POOL_ADDRESS": ["PREDICTION_POOL_CONTRACT_ADDRESS"],
    "RPC_URL": ["HEDERA_TESTNET_RPC"],
    "CHAIN_ID": ["HEDERA_CHAIN_ID"],
}
for target, sources in _ENV_ALIASES.items():
    if not os.environ.get(target):
        for src in sources:
            val = os.environ.get(src)
            if val:
                os.environ[target] = val
                break

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from arena.db.models import init_db
from arena.matchmaking.queue import router as matchmaking_router
from arena.ws.broadcaster import router as ws_router
from arena.ws.emulator_bridge import router as emulator_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="SteamPunk Arena (Hedera)", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(matchmaking_router, prefix="/agents", tags=["agents"])
app.include_router(ws_router, prefix="/matches", tags=["matches"])
app.include_router(emulator_router, tags=["emulator"])


class ChatSendRequest(BaseModel):
    topic_id: str
    message: str
    sender: str = "spectator"


@app.post("/chat/send", tags=["chat"])
async def chat_send(req: ChatSendRequest):
    """
    Send a chat message to a matchmaker agent via HCS.
    The arena server holds the operator key required to submit HCS messages.
    """
    import json
    import time as _time
    from arena.hcs.publisher import publish_match_result

    hcs_message = json.dumps({
        "type": "chat_user",
        "data": req.message,
        "sender": req.sender,
        "timestamp": int(_time.time() * 1000),
    })

    # Reuse the HCS publisher — it submits any JSON message to a topic
    # We call the JS publisher directly since publish_match_result constructs its own payload
    import asyncio
    import os
    from pathlib import Path

    publisher_js = Path(__file__).parent / "hcs" / "hcs-publisher.js"

    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(publisher_js),
            req.topic_id,
            hcs_message,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)

        if proc.returncode != 0:
            logger.error(f"Chat HCS publish failed: {stderr.decode()}")
            raise HTTPException(status_code=502, detail="Failed to publish to HCS")

        result = json.loads(stdout.decode().strip())
        return {
            "status": "sent",
            "sequence_number": result.get("sequenceNumber"),
            "topic_id": req.topic_id,
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="HCS publish timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Node.js not available for HCS publishing")


class FaucetRequest(BaseModel):
    wallet_address: str
    amount: float = 1000  # STEAM tokens (human-readable)


@app.post("/faucet", tags=["faucet"])
async def faucet(req: FaucetRequest):
    """
    Testnet STEAM token faucet. Transfers STEAM from operator treasury.
    Max 10,000 STEAM per request.
    """
    import asyncio
    from web3 import Web3

    amount = min(req.amount, 10000)
    rpc_url = os.environ.get("RPC_URL", "https://testnet.hashio.io/api")
    private_key = os.environ.get("ORACLE_PRIVATE_KEY", os.environ.get("DEPLOYER_KEY", ""))
    steam_address = os.environ.get("STEAM_TOKEN_EVM_ADDRESS", "")

    if not private_key or not steam_address:
        raise HTTPException(status_code=503, detail="Faucet not configured — missing operator key or STEAM address")

    try:
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        # HTS tokens exposed as ERC-20 on Hedera EVM
        erc20_abi = [
            {"inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
             "name": "transfer", "outputs": [{"name": "", "type": "bool"}],
             "stateMutability": "nonpayable", "type": "function"},
        ]
        contract = w3.eth.contract(address=Web3.to_checksum_address(steam_address), abi=erc20_abi)
        account = w3.eth.account.from_key(private_key)

        # 8 decimals for HTS STEAM
        raw_amount = int(amount * 10**8)
        to_addr = Web3.to_checksum_address(req.wallet_address)

        tx = contract.functions.transfer(to_addr, raw_amount).build_transaction({
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address),
            "gas": 300000,
            "gasPrice": w3.eth.gas_price,
        })
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)

        return {
            "status": "success",
            "amount": amount,
            "token": "STEAM",
            "to": req.wallet_address,
            "tx_hash": receipt.transactionHash.hex(),
        }
    except Exception as e:
        logger.error(f"Faucet failed: {e}")
        raise HTTPException(status_code=500, detail=f"Faucet transfer failed: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "steampunk-arena-hedera"}


@app.get("/matches", tags=["matches"])
async def list_matches(
    status: str = "",
    limit: int = 50,
):
    """List matches, optionally filtered by status."""
    from sqlalchemy import select, desc
    from arena.db.models import AsyncSessionLocal, MatchModel

    async with AsyncSessionLocal() as session:
        stmt = select(MatchModel).order_by(desc(MatchModel.created_at)).limit(limit)
        if status:
            stmt = stmt.where(MatchModel.status == status)
        result = await session.execute(stmt)
        matches = result.scalars().all()

    return [
        {
            "match_id": m.match_id,
            "status": m.status,
            "agents": m.agent_addresses.split(","),
            "track_id": m.track_id,
            "wager_amount_wei": m.wager_amount_wei,
            "created_at": m.created_at,
            "started_at": m.started_at,
            "ended_at": m.ended_at,
            "winner": m.winner_address,
            "hcs_message_id": m.hcs_message_id,
        }
        for m in matches
    ]


class MatchStartRequest(BaseModel):
    match_id: str = ""
    game: str = ""
    wager: float = 0
    agents: list[dict] = []


@app.post("/matches/{match_id}/start", tags=["matches"])
async def start_match(
    match_id: str,
    background_tasks: BackgroundTasks,
    game_type: str = "mariokart64",
    body: MatchStartRequest | None = None,
):
    """
    Start a pending match. Reads agents from DB (created by matchmaking queue).
    If match doesn't exist in DB (e.g. created by HCS-10 matchmaker), creates it
    from the request body.
    game_type: "mariokart64" (default) or "clash_of_wits" (RPSLS fallback game).
    """
    import time as _time
    from sqlalchemy import select
    from arena.db.models import AsyncSessionLocal, MatchModel
    from arena.race_runner import RaceRunner

    async with AsyncSessionLocal() as session:
        stmt = select(MatchModel).where(MatchModel.match_id == match_id)
        result = await session.execute(stmt)
        match = result.scalar_one_or_none()

        if not match:
            # Auto-create match from body (HCS-10 matchmaker flow)
            if body and body.agents:
                agent_addrs = [
                    (a.get("account_id") or a.get("address") or "").lower()
                    for a in body.agents
                ]
                agent_addrs = [a for a in agent_addrs if a]
                if len(agent_addrs) < 2:
                    raise HTTPException(status_code=400, detail="Need at least 2 agents in body")
                wager_raw = str(int(body.wager * (10 ** 8))) if body.wager else "0"
                match = MatchModel(
                    match_id=match_id,
                    track_id=0,
                    status="pending",
                    agent_addresses=",".join(agent_addrs),
                    wager_amount_wei=wager_raw,
                    created_at=int(_time.time() * 1000),
                )
                session.add(match)
                await session.flush()
                logger.info(f"Auto-created match {match_id} from HCS-10 matchmaker: {agent_addrs}")
            else:
                raise HTTPException(status_code=404, detail="Match not found")

        if match.status != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Match is '{match.status}', expected 'pending'",
            )

        match.status = "in_progress"
        match.started_at = int(_time.time() * 1000)
        session.add(match)
        await session.commit()

        agent_list = [a.strip().lower() for a in match.agent_addresses.split(",") if a.strip()]

    if len(agent_list) < 2:
        raise HTTPException(status_code=400, detail="Match has fewer than 2 agents")

    # Select game adapter based on game_type
    adapter = None
    if game_type == "clash_of_wits":
        from arena.adapters.strategy_game import StrategyGameAdapter
        adapter = StrategyGameAdapter()
        _active_strategy_adapters[match_id] = adapter

    runner = RaceRunner(match_id=match_id, agents=agent_list, adapter=adapter, game_type=game_type)

    async def _run():
        try:
            result = await runner.run()
            logger.info(f"Match {match_id} completed: {result}")
        except Exception as exc:
            logger.error(f"Match {match_id} failed: {exc}")
        finally:
            _active_strategy_adapters.pop(match_id, None)

    background_tasks.add_task(_run)

    return {"status": "starting", "match_id": match_id, "agents": agent_list, "game_type": game_type}


# Track active strategy game adapters so agents can submit moves
_active_strategy_adapters: dict = {}

# Rate limiting for strategy updates: agent_id -> last_update_timestamp
_strategy_rate_limits: dict[str, float] = {}
STRATEGY_RATE_LIMIT_S = 5.0  # 1 update per 5 seconds per agent


@app.post("/matches/{match_id}/action", tags=["matches"])
async def submit_action(match_id: str, agent_id: str, action: str):
    """
    Submit a move for a Clash of Wits match.
    agent_id: agent wallet address.
    action: one of rock, paper, scissors, lizard, spock.
    """
    adapter = _active_strategy_adapters.get(match_id)
    if adapter is None:
        raise HTTPException(
            status_code=404,
            detail="No active strategy game found for this match. Is it a clash_of_wits game?",
        )
    try:
        result = await adapter.submit_action(match_id, agent_id.lower(), action)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class StrategyRequest(BaseModel):
    agent_id: str
    strategy: str = "balanced"      # aggressive | defensive | balanced | item_focus
    target: str = "none"            # leader | nearest | none
    item_policy: str = "immediate"  # immediate | save_for_straight | save_for_opponent
    reasoning: str = ""


@app.post("/matches/{match_id}/strategy", tags=["matches"])
async def set_strategy(match_id: str, req: StrategyRequest):
    """
    Set game strategy for an external agent during an MK64 match.
    Rate-limited to 1 update per 5 seconds per agent.
    The strategy is forwarded to the emulator which adjusts the agent's
    RuleBasedAgent parameters accordingly.
    """
    import time as _time
    from arena.ws.emulator_bridge import emulator_registry

    agent_id = req.agent_id.lower()

    # Rate limiting
    now = _time.time()
    last_update = _strategy_rate_limits.get(agent_id, 0.0)
    wait_s = STRATEGY_RATE_LIMIT_S - (now - last_update)
    if wait_s > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limited. Next strategy update allowed in {wait_s:.1f}s",
        )

    # Find the emulator running this match
    emu = await emulator_registry.get_by_match(match_id)
    if emu is None:
        raise HTTPException(
            status_code=404,
            detail="No active emulator found for this match",
        )

    # Validate strategy value
    valid_strategies = {"aggressive", "defensive", "balanced", "item_focus"}
    strategy = req.strategy if req.strategy in valid_strategies else "balanced"

    # Forward to emulator
    await emu.send_strategy_update(
        match_id=match_id,
        agent_id=agent_id,
        strategy=strategy,
        target=req.target,
        item_policy=req.item_policy,
        reasoning=req.reasoning,
    )

    _strategy_rate_limits[agent_id] = now

    # Return current game state from last tick
    state = _get_agent_state_from_tick(emu, agent_id)
    return {
        "status": "strategy_accepted",
        "strategy": strategy,
        "next_strategy_window_ms": int(STRATEGY_RATE_LIMIT_S * 1000),
        **state,
    }


@app.get("/matches/{match_id}/state", tags=["matches"])
async def get_match_state(match_id: str):
    """
    Get current game state for a running MK64 match.
    External agents poll this to make strategy decisions.
    """
    from arena.ws.emulator_bridge import emulator_registry

    emu = await emulator_registry.get_by_match(match_id)
    if emu is None:
        raise HTTPException(
            status_code=404,
            detail="No active emulator found for this match",
        )

    tick = emu._last_tick
    if tick is None:
        return {"match_id": match_id, "race_status": "waiting", "players": []}

    players = []
    for p in tick.players:
        players.append({
            "agent_id": p.agent_id,
            "position": p.position,
            "lap": p.lap,
            "total_laps": p.total_laps,
            "speed": p.speed,
            "item": p.item,
            "x": p.x,
            "y": p.y,
            "finished": p.finished,
            "finish_time_ms": p.finish_time_ms,
        })

    return {
        "match_id": match_id,
        "tick": tick.tick,
        "race_status": tick.race_status,
        "players": players,
        "timestamp_ms": tick.timestamp_ms,
    }


def _get_agent_state_from_tick(emu, agent_id: str) -> dict:
    """Extract a single agent's state from the emulator's last tick."""
    tick = emu._last_tick
    if tick is None:
        return {}
    for p in tick.players:
        if p.agent_id == agent_id:
            return {
                "current_lap": p.lap,
                "position": p.position,
                "speed": p.speed,
                "item": p.item,
            }
    return {}
