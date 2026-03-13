"""
Emulator service entrypoint.

Connects to the arena server via WebSocket, waits for match commands,
runs the MK64 emulator, and streams game state back to the arena.

Flow:
    1. Connect to arena WS at ARENA_WS_URL
    2. Send EmulatorReadyMessage
    3. Wait for ArenaStartMatchCommand
    4. Run MarioKart64MultiAgentEnv with registered agents
    5. Stream EmulatorTickMessage every frame
    6. Send EmulatorRaceEndMessage when race finishes
    7. Wait for next match or ArenaStopMatchCommand

Runs inside Docker with stable-retro (headless, no Xvfb needed).

Arena WS URL configurable via ARENA_WS_URL env var.
Default: ws://localhost:8000
"""
from __future__ import annotations
import asyncio
import logging
import os
import signal
import sys
import time

import websockets

from emulator.ws.internal_schema import (
    EmulatorReadyMessage,
    EmulatorTickMessage,
    EmulatorRaceEndMessage,
    EmulatorPlayerState,
    ArenaStartMatchCommand,
    ArenaStopMatchCommand,
)
from emulator.envs.mariokart64_multi import MarioKart64MultiAgentEnv
from emulator.envs.mariokart64_retro import RETRO_AVAILABLE as GYM_AVAILABLE
from emulator.agents.base import Observation, Action, AgentMetadata
from emulator.agents.rule_based import RuleBasedAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("emulator")

ARENA_WS_URL = os.environ.get("ARENA_WS_URL", "ws://localhost:8000")
EMULATOR_ID = os.environ.get("EMULATOR_ID", "emu-001")
# Note: when stable-retro is active, env.step() blocks until the emulator
# renders the next frame (~60fps for MK64). The tick rate below is only used
# in stub mode where step() returns immediately.
TICK_RATE_HZ = 10
STUB_TICK_INTERVAL = 1.0 / TICK_RATE_HZ


class EmulatorService:
    """
    Long-running service that bridges MK64 emulator <-> arena via WebSocket.
    """

    def __init__(self):
        self.emulator_id = EMULATOR_ID
        self.env: MarioKart64MultiAgentEnv | None = None
        self._running = False
        self._match_id: str = ""

    async def run(self):
        """Main loop: connect to arena, handle commands."""
        while True:
            try:
                await self._connect_and_serve()
            except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as e:
                logger.warning(f"Connection lost ({type(e).__name__}), reconnecting in 3s...")
                await asyncio.sleep(3.0)
            except Exception as e:
                logger.error(f"Unexpected error: {e}", exc_info=True)
                await asyncio.sleep(5.0)

    async def _connect_and_serve(self):
        """Single connection lifecycle."""
        # Connect to arena's internal emulator endpoint
        uri = f"{ARENA_WS_URL}/emulator/ws"
        logger.info(f"Connecting to arena at {uri}...")

        async with websockets.connect(uri) as ws:
            logger.info("Connected to arena")

            # Announce readiness
            ready = EmulatorReadyMessage(
                emulator_id=self.emulator_id,
                supported_games=["mariokart64"],
                max_agents=4,
            )
            await ws.send(ready.to_json())
            logger.info(f"Sent ready message: {self.emulator_id}")

            # Command loop
            async for raw in ws:
                await self._handle_message(ws, raw)

    async def _handle_message(self, ws, raw: str):
        """Dispatch incoming arena command."""
        import json
        data = json.loads(raw)
        msg_type = data.get("type", "")

        if msg_type == "start_match":
            cmd = ArenaStartMatchCommand.from_json(raw)
            await self._run_match(ws, cmd)
        elif msg_type == "stop_match":
            logger.info(f"Stop match command received: {data.get('match_id')}")
            self._running = False
        else:
            logger.warning(f"Unknown message type: {msg_type}")

    async def _run_match(self, ws, cmd: ArenaStartMatchCommand):
        """
        Run a full match: init env, create agents, step loop, send results.
        """
        self._match_id = cmd.match_id
        self._running = True
        n_agents = len(cmd.agents)
        logger.info(f"Starting match {cmd.match_id}: {n_agents} agents, track={cmd.track_id}")

        try:
            # Create environment
            self.env = MarioKart64MultiAgentEnv(
                n_agents=n_agents,
                track_id=cmd.track_id,
                total_laps=cmd.total_laps,
            )

            # Create rule-based agents for each slot
            # In future: arena will specify agent type per slot
            agents = []
            for i, addr in enumerate(cmd.agents):
                agent = RuleBasedAgent(
                    name=f"agent-{i}",
                    owner_wallet=addr,
                    agent_wallet=addr,
                )
                agents.append((addr, agent))

            self.env.register_agents(agents)

            logger.info("Calling env.reset() — this may take 15-30s per instance (menu navigation)...")
            t0 = time.time()
            observations = self.env.reset()
            logger.info(f"env.reset() completed in {time.time() - t0:.1f}s")

            tick = 0
            use_stub_timing = not GYM_AVAILABLE

            while self._running:
                tick += 1

                # Collect actions from all agents
                actions = {}
                for agent_id, agent in agents:
                    obs = observations.get(agent_id)
                    if obs and not obs.finished:
                        action, _ = agent.act(obs)
                        actions[agent_id] = action

                # Step environment
                observations, rewards, done, info = self.env.step(actions)

                # Build tick message
                players = []
                for agent_id, obs in observations.items():
                    players.append(EmulatorPlayerState(
                        agent_id=agent_id,
                        player_index=cmd.agents.index(agent_id),
                        x=obs.x,
                        y=obs.y,
                        position=obs.position,
                        lap=obs.lap,
                        total_laps=obs.total_laps,
                        speed=obs.speed,
                        item=obs.item,
                        finished=obs.finished,
                        finish_time_ms=obs.finish_time_ms,
                    ))

                tick_msg = EmulatorTickMessage(
                    match_id=cmd.match_id,
                    tick=tick,
                    race_status="finished" if done else "in_progress",
                    players=players,
                    timestamp_ms=int(time.time() * 1000),
                )
                await ws.send(tick_msg.to_json())

                if done:
                    break

                # In real mode, env.step() blocks until next frame (~30fps).
                # In stub mode, we need to sleep to avoid busy-looping.
                if use_stub_timing:
                    await asyncio.sleep(STUB_TICK_INTERVAL)

            # Send race end
            result = self.env.get_race_result()
            end_msg = EmulatorRaceEndMessage(
                match_id=cmd.match_id,
                agents=result["agents"],
                final_positions=result["finalPositions"],
                finish_times_ms=result["finishTimes"],
                track_id=result["trackId"],
                timestamp_ms=int(time.time() * 1000),
            )
            await ws.send(end_msg.to_json())
            logger.info(f"Match {cmd.match_id} complete. Positions: {result['finalPositions']}")

        except Exception as e:
            logger.error(f"Match {cmd.match_id} failed: {e}", exc_info=True)
        finally:
            if self.env:
                self.env.close()
                self.env = None
            self._running = False


async def main():
    service = EmulatorService()

    # Graceful shutdown on SIGTERM/SIGINT
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown(service)))

    await service.run()


async def shutdown(service: EmulatorService):
    logger.info("Shutting down emulator service...")
    service._running = False
    if service.env:
        service.env.close()
    # Give ongoing tasks a moment to finish
    await asyncio.sleep(0.5)
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
