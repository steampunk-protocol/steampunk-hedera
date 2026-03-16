"""
Internal WebSocket bridge: emulator → arena.

Accepts connections from emulator Docker containers. Receives raw game state
(EmulatorTickMessage) and forwards it to the public broadcaster for frontends.

Also dispatches match start/stop commands to the connected emulator.

Imports message types from emulator/ws/internal_schema.py (single source of truth).
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from arena.emulator_schema import (
    EmulatorReadyMessage,
    EmulatorTickMessage,
    EmulatorRaceEndMessage,
    ArenaStartMatchCommand,
    ArenaStopMatchCommand,
    ArenaStrategyUpdateCommand,
)
from arena.ws.broadcaster import manager
from arena.ws.schema import (
    RaceTickMessage, RaceStartMessage, RaceEndMessage, PlayerState,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class EmulatorConnection:
    """Tracks one connected emulator instance."""

    def __init__(self, ws: WebSocket, emulator_id: str):
        self.ws = ws
        self.emulator_id = emulator_id
        self.supported_games: list[str] = []
        self.max_agents: int = 4
        self.current_match_id: Optional[str] = None
        # Race completion signaling — set by _handle_race_end, awaited by RaceRunner
        self._race_completed = asyncio.Event()
        self._race_result: Optional[dict] = None
        # Cached last tick for game state polling
        self._last_tick: Optional[EmulatorTickMessage] = None

    async def send_start_match(
        self, match_id: str, agents: list[str], track_id: int = 0, total_laps: int = 3,
    ):
        self._race_completed.clear()
        self._race_result = None
        cmd = ArenaStartMatchCommand(
            match_id=match_id,
            agents=agents,
            track_id=track_id,
            total_laps=total_laps,
        )
        self.current_match_id = match_id
        await self.ws.send_text(cmd.to_json())
        logger.info(f"Sent start_match to {self.emulator_id}: {match_id}")

    async def send_stop_match(self, match_id: str):
        cmd = ArenaStopMatchCommand(match_id=match_id)
        await self.ws.send_text(cmd.to_json())
        self.current_match_id = None

    async def send_strategy_update(
        self,
        match_id: str,
        agent_id: str,
        strategy: str,
        target: str = "none",
        item_policy: str = "immediate",
        reasoning: str = "",
    ):
        """Forward an external agent's strategy command to the emulator."""
        cmd = ArenaStrategyUpdateCommand(
            match_id=match_id,
            agent_id=agent_id,
            strategy=strategy,
            target=target,
            item_policy=item_policy,
            reasoning=reasoning,
        )
        await self.ws.send_text(cmd.to_json())
        logger.info(f"Sent strategy_update to {self.emulator_id}: {agent_id} -> {strategy}")

    async def wait_for_race_end(self, timeout: float = 300.0) -> dict:
        """Block until the emulator sends race_end. Returns the raw result dict."""
        await asyncio.wait_for(self._race_completed.wait(), timeout=timeout)
        return self._race_result

    def _set_race_result(self, result: dict):
        """Called by _handle_race_end to unblock wait_for_race_end."""
        self._race_result = result
        self._race_completed.set()


class EmulatorRegistry:
    """
    Registry of connected emulator instances.
    Arena picks an available emulator when starting a match.
    """

    def __init__(self):
        self._emulators: dict[str, EmulatorConnection] = {}
        self._lock = asyncio.Lock()

    async def register(self, conn: EmulatorConnection):
        async with self._lock:
            self._emulators[conn.emulator_id] = conn
        logger.info(f"Emulator registered: {conn.emulator_id} (games={conn.supported_games})")

    async def unregister(self, emulator_id: str):
        async with self._lock:
            self._emulators.pop(emulator_id, None)
        logger.info(f"Emulator unregistered: {emulator_id}")

    async def get_available(self, game: str = "mariokart64") -> Optional[EmulatorConnection]:
        """Get an emulator that supports the game and has no active match."""
        async with self._lock:
            for conn in self._emulators.values():
                if game in conn.supported_games and conn.current_match_id is None:
                    return conn
        return None

    async def get_by_match(self, match_id: str) -> Optional[EmulatorConnection]:
        """Get the emulator running a specific match."""
        async with self._lock:
            for conn in self._emulators.values():
                if conn.current_match_id == match_id:
                    return conn
        return None

    @property
    def count(self) -> int:
        return len(self._emulators)


# Global registry — used by race_runner to dispatch matches
emulator_registry = EmulatorRegistry()


@router.websocket("/emulator/ws")
async def emulator_ws(websocket: WebSocket):
    """
    Internal WebSocket endpoint for emulator containers.
    Protocol:
        1. Emulator sends EmulatorReadyMessage
        2. Arena sends ArenaStartMatchCommand when a match is queued
        3. Emulator streams EmulatorTickMessage
        4. Emulator sends EmulatorRaceEndMessage when done
    """
    await websocket.accept()
    conn: Optional[EmulatorConnection] = None

    try:
        # Wait for ready message
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        data = json.loads(raw)

        if data.get("type") != "emulator_ready":
            logger.warning(f"Expected emulator_ready, got {data.get('type')}")
            await websocket.close(code=1002)
            return

        ready = EmulatorReadyMessage.from_json(raw)
        conn = EmulatorConnection(
            ws=websocket,
            emulator_id=ready.emulator_id,
        )
        conn.supported_games = ready.supported_games
        conn.max_agents = ready.max_agents

        await emulator_registry.register(conn)

        # Message loop — receive ticks and race end from emulator
        async for raw in websocket.iter_text():
            data = json.loads(raw)
            msg_type = data.get("type", "")

            if msg_type == "emulator_tick":
                await _handle_tick(conn, raw)
            elif msg_type == "emulator_race_end":
                await _handle_race_end(conn, raw)
            else:
                logger.warning(f"Unknown emulator message: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"Emulator disconnected: {conn.emulator_id if conn else 'unknown'}")
    except asyncio.TimeoutError:
        logger.warning("Emulator did not send ready message within 10s")
        await websocket.close(code=1002)
    except Exception as e:
        logger.error(f"Emulator WS error: {e}", exc_info=True)
    finally:
        if conn:
            await emulator_registry.unregister(conn.emulator_id)


async def _handle_tick(conn: EmulatorConnection, raw: str):
    """Forward emulator tick to public WS as RaceTickMessage."""
    tick = EmulatorTickMessage.from_json(raw)
    conn._last_tick = tick
    match_id = tick.match_id

    players = [
        PlayerState(
            agent_id=p.agent_id,
            wallet_address=p.agent_id,
            model_name="unknown",
            character="toad",
            position=p.position,
            lap=p.lap,
            total_laps=p.total_laps,
            item=p.item,
            speed=p.speed,
            x=p.x,
            y=p.y,
            gap_to_leader_ms=0,
            finished=p.finished,
        )
        for p in tick.players
    ]

    public_tick = RaceTickMessage(
        match_id=match_id,
        tick=tick.tick,
        race_status=tick.race_status,
        players=players,
        timestamp_ms=tick.timestamp_ms,
    )
    await manager.broadcast_tick(match_id, public_tick)


async def _handle_race_end(conn: EmulatorConnection, raw: str):
    """Forward emulator race end to public WS and signal RaceRunner."""
    end = EmulatorRaceEndMessage.from_json(raw)
    match_id = end.match_id
    zero = "0x" + "0" * 40

    final_positions = {
        end.agents[i]: end.final_positions[i]
        for i in range(len(end.agents))
        if end.agents[i] != zero
    }
    finish_times = {
        end.agents[i]: end.finish_times_ms[i]
        for i in range(len(end.agents))
        if end.agents[i] != zero
    }

    # Broadcast to frontend subscribers
    public_end = RaceEndMessage(
        match_id=match_id,
        final_positions=final_positions,
        finish_times_ms=finish_times,
        match_result_hash="0x" + "0" * 64,  # filled after on-chain submission
        timestamp_ms=end.timestamp_ms,
    )
    await manager.broadcast_end(match_id, public_end)

    # Build normalized result dict for RaceRunner settlement
    result = {
        "agents": end.agents,
        "finalPositions": end.final_positions,
        "finishTimes": end.finish_times_ms,
        "trackId": end.track_id,
        "matchId": match_id,
        "timestamp": end.timestamp_ms // 1000,
    }
    conn._set_race_result(result)
    conn.current_match_id = None
    logger.info(f"Race end forwarded for match {match_id}")
