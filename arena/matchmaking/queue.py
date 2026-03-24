"""
Agent registration and matchmaking queue.
"""
from __future__ import annotations
import time
import uuid
import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from arena.db.models import get_session, AgentModel, MatchModel
from arena.utils import match_id_to_uint256
from arena.pool_lifecycle import create_pool_on_chain, create_wager_on_chain

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory matchmaking queue: list of (agent_address, wager_amount) tuples
_queue: list[tuple[str, float]] = []
_queue_lock = asyncio.Lock()
MIN_PLAYERS = 2
MAX_PLAYERS = 4
QUEUE_TIMEOUT_S = 60
STEAM_DECIMALS = 8
BETTING_WINDOW_S = 120  # seconds between match creation and auto-start (2 min for Hedera tx speed)


class AgentRegistration(BaseModel):
    address: str
    name: str
    model_name: str
    owner_wallet: str
    hcs_topic_id: Optional[str] = None  # Hedera HCS inbound topic (0.0.XXXXX)


class QueueJoinRequest(BaseModel):
    agent_address: str
    wager_amount: float = 10.0  # STEAM entrance fee (human-readable, 8 decimals)


@router.post("/register")
async def register_agent(
    registration: AgentRegistration,
    session: AsyncSession = Depends(get_session),
):
    """Register an AI agent with the arena."""
    addr = registration.address.lower()
    existing = await session.get(AgentModel, addr)
    if existing:
        return {"status": "already_registered", "address": addr, "elo": existing.elo}

    agent = AgentModel(
        address=addr,
        hcs_topic_id=registration.hcs_topic_id,
        name=registration.name,
        model_name=registration.model_name,
        owner_wallet=registration.owner_wallet.lower(),
        elo=1200,
        matches_played=0,
        registered_at=int(time.time() * 1000),
    )
    session.add(agent)
    await session.commit()
    logger.info(f"Registered agent: {addr} ({registration.name})")
    return {"status": "registered", "address": addr, "elo": 1200}


@router.post("/matches/queue")
async def join_queue(
    request: QueueJoinRequest,
    session: AsyncSession = Depends(get_session),
):
    """Join matchmaking queue. Returns match_id if match is created."""
    addr = request.agent_address.lower()
    agent = await session.get(AgentModel, addr)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not registered")

    wager = request.wager_amount

    async with _queue_lock:
        queued_addrs = [a for a, _ in _queue]
        if addr in queued_addrs:
            return {"status": "already_queued", "position": queued_addrs.index(addr) + 1}

        _queue.append((addr, wager))
        logger.info(f"Agent {addr} joined queue (wager={wager} STEAM). Queue size: {len(_queue)}")

        if len(_queue) >= MIN_PLAYERS:
            entries = _queue[:MAX_PLAYERS]
            del _queue[:len(entries)]
            participants = [a for a, _ in entries]
            # Use minimum wager among participants
            match_wager = min(w for _, w in entries)
            # Convert to raw units (8 decimals)
            wager_amount_raw = str(int(match_wager * (10 ** STEAM_DECIMALS)))

            match_id = str(uuid.uuid4())
            numeric_match_id = match_id_to_uint256(match_id)
            match = MatchModel(
                match_id=match_id,
                track_id=0,
                status="pending",
                agent_addresses=",".join(participants),
                wager_amount_wei=wager_amount_raw,
                created_at=int(time.time() * 1000),
            )
            session.add(match)
            await session.commit()
            logger.info(
                f"Match created: {match_id} (on-chain ID: {numeric_match_id}) "
                f"with {participants}, wager={match_wager} STEAM"
            )

            # Create pool + wager on-chain sequentially (avoid nonce collision)
            wager_raw = int(match_wager * (10 ** STEAM_DECIMALS))
            asyncio.ensure_future(_create_on_chain(match_id, participants, wager_raw))

            # Auto-start match after betting window
            asyncio.ensure_future(_auto_start_after_betting_window(match_id, participants))

            return {
                "status": "matched",
                "match_id": match_id,
                "numeric_match_id": str(numeric_match_id),
                "agents": participants,
                "wager_amount": match_wager,
                "betting_window_s": BETTING_WINDOW_S,
                "auto_start_at": int(time.time() * 1000) + BETTING_WINDOW_S * 1000,
            }

    return {"status": "queued", "position": len(_queue)}


@router.get("/matches/{match_id}")
async def get_match(
    match_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get match status and metadata."""
    match = await session.get(MatchModel, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Resolve agent names from DB
    from sqlalchemy import select
    addresses = match.agent_addresses.split(",")
    agent_details = []
    winner_name = None
    for addr in addresses:
        stmt = select(AgentModel).where(AgentModel.address == addr.lower())
        row = (await session.execute(stmt)).scalar_one_or_none()
        name = row.name if row else addr[:12]
        agent_details.append({"address": addr, "name": name})
        if match.winner_address and addr.lower() == match.winner_address.lower():
            winner_name = name

    return {
        "match_id": match.match_id,
        "status": match.status,
        "agents": addresses,
        "agent_details": agent_details,
        "track_id": match.track_id,
        "created_at": match.created_at,
        "started_at": match.started_at,
        "ended_at": match.ended_at,
        "winner": match.winner_address,
        "winner_name": winner_name,
        "hcs_message_id": match.hcs_message_id,
        "on_chain_tx": match.on_chain_tx,
        "match_result_hash": match.match_result_hash,
        "betting_window_s": BETTING_WINDOW_S,
        "betting_ends_at": (match.created_at + BETTING_WINDOW_S * 1000) if match.status == "pending" else None,
    }


@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    """Return agents sorted by Elo descending with win/loss stats."""
    result = await session.execute(
        select(AgentModel).order_by(desc(AgentModel.elo)).limit(limit)
    )
    agents = result.scalars().all()

    # Compute win/loss per agent from completed matches
    leaderboard = []
    for agent in agents:
        # Count wins: matches where this agent is the winner
        wins_result = await session.execute(
            select(func.count()).select_from(MatchModel).where(
                MatchModel.winner_address == agent.address,
                MatchModel.status == "settled",
            )
        )
        wins = wins_result.scalar() or 0

        # Count total settled matches this agent participated in
        played_result = await session.execute(
            select(func.count()).select_from(MatchModel).where(
                MatchModel.agent_addresses.contains(agent.address),
                MatchModel.status == "settled",
            )
        )
        played = played_result.scalar() or 0

        leaderboard.append({
            "address": agent.address,
            "name": agent.name,
            "model_name": agent.model_name,
            "elo": agent.elo,
            "hcs_topic_id": agent.hcs_topic_id,
            "matches_played": played,
            "wins": wins,
            "losses": played - wins,
        })

    return leaderboard


async def _create_on_chain(match_id: str, agents: list[str], wager_raw: int) -> None:
    """Create pool + wager on-chain sequentially to avoid nonce collision."""
    try:
        await create_pool_on_chain(match_id, agents)
    except Exception as e:
        logger.error(f"createPool failed for {match_id}: {e}")
    try:
        if wager_raw > 0:
            await create_wager_on_chain(match_id, agents, wager_raw)
    except Exception as e:
        logger.error(f"createWager failed for {match_id}: {e}")


async def _auto_start_after_betting_window(match_id: str, agents: list[str]) -> None:
    """
    Platform-controlled auto-start: wait for betting window then start the match.
    This replaces the agent-triggered /start flow for the standard matchmaking path.
    """
    logger.info(f"Betting window open for match {match_id} — auto-start in {BETTING_WINDOW_S}s")
    await asyncio.sleep(BETTING_WINDOW_S)

    # Check if match was already started (e.g. by agent calling /start manually)
    from arena.db.models import AsyncSessionLocal, MatchModel
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        stmt = select(MatchModel).where(MatchModel.match_id == match_id)
        result = await session.execute(stmt)
        match = result.scalar_one_or_none()

        if not match:
            logger.warning(f"Auto-start: match {match_id} not found")
            return
        if match.status != "pending":
            logger.info(f"Auto-start: match {match_id} already {match.status}, skipping")
            return

        # Start the match
        import time as _time
        match.status = "in_progress"
        match.started_at = int(_time.time() * 1000)
        session.add(match)
        await session.commit()
        logger.info(f"Auto-start: match {match_id} started after {BETTING_WINDOW_S}s betting window")

    # Run the match
    from arena.race_runner import RaceRunner
    game_type = "streetfighter2"
    runner = RaceRunner(match_id=match_id, agents=agents, game_type=game_type)
    try:
        result = await runner.run()
        logger.info(f"Auto-start match {match_id} completed: {result}")
    except Exception as exc:
        logger.error(f"Auto-start match {match_id} failed: {exc}")
