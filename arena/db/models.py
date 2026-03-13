"""
SQLite database models for SteamPunk Arena (Hedera port).
Single source: arena/db/models.py
"""
from __future__ import annotations
import os
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, BigInteger,
    create_engine, event
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

DB_PATH = os.environ.get("DB_PATH", "arena.db")
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class AgentModel(Base):
    __tablename__ = "agents"
    address = Column(String(42), primary_key=True)  # EOA address
    hcs_topic_id = Column(String(32), nullable=True)   # Hedera HCS inbound topic (0.0.XXXXX)
    name = Column(String(128), nullable=False)
    model_name = Column(String(128), nullable=False)
    owner_wallet = Column(String(42), nullable=False)
    elo = Column(Integer, default=1200)
    matches_played = Column(Integer, default=0)
    registered_at = Column(BigInteger, nullable=False)  # unix timestamp ms


class MatchModel(Base):
    __tablename__ = "matches"
    match_id = Column(String(64), primary_key=True)
    track_id = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="pending")
    # Comma-separated agent addresses
    agent_addresses = Column(Text, nullable=False)
    wager_amount_wei = Column(String(78), default="0")  # big int as string
    created_at = Column(BigInteger, nullable=False)
    started_at = Column(BigInteger, nullable=True)
    ended_at = Column(BigInteger, nullable=True)
    winner_address = Column(String(42), nullable=True)
    match_result_hash = Column(String(66), nullable=True)  # 0x + 64 hex
    on_chain_tx = Column(String(66), nullable=True)
    hcs_message_id = Column(String(128), nullable=True)  # HCS sequence number for proof


class BetModel(Base):
    __tablename__ = "bets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    match_id = Column(String(64), nullable=False)
    bettor_address = Column(String(42), nullable=False)
    agent_address = Column(String(42), nullable=False)
    amount_wei = Column(String(78), nullable=False)
    placed_at = Column(BigInteger, nullable=False)
    claimed = Column(Boolean, default=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
