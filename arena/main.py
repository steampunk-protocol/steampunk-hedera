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

    runner = RaceRunner(match_id=match_id, agents=agent_list, adapter=adapter)

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
