"""
SteamPunk Arena Server — FastAPI entrypoint (Hedera port).
"""
import asyncio
import logging
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "steampunk-arena-hedera"}


@app.post("/matches/{match_id}/start", tags=["matches"])
async def start_match(match_id: str, background_tasks: BackgroundTasks, agents: str = ""):
    """
    Start a match in the background.

    Query params:
        agents: comma-separated list of agent wallet addresses (2-4)

    Example:
        POST /matches/match-001/start?agents=0xABC...,0xDEF...
    """
    from arena.race_runner import RaceRunner

    agent_list = [a.strip().lower() for a in agents.split(",") if a.strip()] if agents else []

    if len(agent_list) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 agent addresses required (comma-separated 'agents' query param)",
        )
    if len(agent_list) > 4:
        raise HTTPException(
            status_code=400,
            detail="Maximum 4 agents supported",
        )

    runner = RaceRunner(match_id=match_id, agents=agent_list)

    async def _run():
        try:
            result = await runner.run()
            logger.info(f"Match {match_id} completed: {result}")
        except Exception as exc:
            logger.error(f"Match {match_id} failed: {exc}")

    background_tasks.add_task(_run)

    return {"status": "starting", "match_id": match_id, "agents": agent_list}
