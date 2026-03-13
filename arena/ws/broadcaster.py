"""
WebSocket connection manager and broadcaster.
Imports message types from arena/ws/schema.py — never redefines them.
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from arena.ws.schema import (
    RaceTickMessage, RaceStartMessage, RaceEndMessage,
    BettingUpdateMessage, AgentReasoningMessage
)

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for all active matches."""

    def __init__(self):
        # match_id -> list of connected WebSockets
        self._connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, match_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            if match_id not in self._connections:
                self._connections[match_id] = []
            self._connections[match_id].append(websocket)
        logger.info(f"WS connected: match={match_id}, total={len(self._connections.get(match_id, []))}")

    async def disconnect(self, match_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            if match_id in self._connections:
                self._connections[match_id].remove(websocket)
                if not self._connections[match_id]:
                    del self._connections[match_id]

    async def broadcast(self, match_id: str, message: str) -> None:
        """Broadcast a JSON message to all connections for a match."""
        connections = self._connections.get(match_id, [])
        if not connections:
            return
        dead = []
        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(match_id, ws)

    async def broadcast_tick(self, match_id: str, msg: RaceTickMessage) -> None:
        await self.broadcast(match_id, msg.to_json())

    async def broadcast_start(self, match_id: str, msg: RaceStartMessage) -> None:
        await self.broadcast(match_id, msg.to_json())

    async def broadcast_end(self, match_id: str, msg: RaceEndMessage) -> None:
        await self.broadcast(match_id, msg.to_json())

    async def broadcast_betting(self, match_id: str, msg: BettingUpdateMessage) -> None:
        await self.broadcast(match_id, msg.to_json())

    async def broadcast_reasoning(self, match_id: str, msg: AgentReasoningMessage) -> None:
        await self.broadcast(match_id, msg.to_json())


manager = ConnectionManager()


@router.websocket("/{match_id}/stream")
async def match_stream(match_id: str, websocket: WebSocket):
    """WebSocket endpoint for live race streaming."""
    await manager.connect(match_id, websocket)
    try:
        # Keep connection alive, receive any client messages (e.g. ping)
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle ping
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_text(json.dumps({"type": "keepalive"}))
    except WebSocketDisconnect:
        await manager.disconnect(match_id, websocket)
        logger.info(f"WS disconnected: match={match_id}")
