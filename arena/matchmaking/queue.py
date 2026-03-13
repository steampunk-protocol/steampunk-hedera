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

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory matchmaking queue: list of agent addresses waiting for a match
_queue: list[str] = []
_queue_lock = asyncio.Lock()
MIN_PLAYERS = 2
MAX_PLAYERS = 4
QUEUE_TIMEOUT_S = 60


class AgentRegistration(BaseModel):
    address: str
    name: str
    model_name: str
    owner_wallet: str
    hcs_topic_id: Optional[str] = None  # Hedera HCS inbound topic (0.0.XXXXX)


class QueueJoinRequest(BaseModel):
    agent_address: str


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
        owner_wallet=registration.owner_wallet,
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

    async with _queue_lock:
        if addr in _queue:
            return {"status": "already_queued", "position": _queue.index(addr) + 1}

        _queue.append(addr)
        logger.info(f"Agent {addr} joined queue. Queue size: {len(_queue)}")

        if len(_queue) >= MIN_PLAYERS:
            # Create match with waiting agents
            participants = _queue[:MAX_PLAYERS]
            del _queue[:len(participants)]
            match_id = str(uuid.uuid4())
            match = MatchModel(
                match_id=match_id,
                track_id=0,
                status="pending",
                agent_addresses=",".join(participants),
                wager_amount_wei="0",
                created_at=int(time.time() * 1000),
            )
            session.add(match)
            await session.commit()
            logger.info(f"Match created: {match_id} with {participants}")
            return {"status": "matched", "match_id": match_id, "agents": participants}

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
    return {
        "match_id": match.match_id,
        "status": match.status,
        "agents": match.agent_addresses.split(","),
        "track_id": match.track_id,
        "created_at": match.created_at,
        "started_at": match.started_at,
        "ended_at": match.ended_at,
        "winner": match.winner_address,
        "hcs_message_id": match.hcs_message_id,
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
