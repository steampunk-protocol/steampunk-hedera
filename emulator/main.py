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
    ArenaStrategyUpdateCommand,
)
from emulator.envs.mariokart64_multi import MarioKart64MultiAgentEnv
from emulator.envs.mariokart64_retro import RETRO_AVAILABLE as GYM_AVAILABLE
from emulator.agents.base import GameAgent, Observation, Action, AgentMetadata
from emulator.agents.rule_based import RuleBasedAgent
from emulator.agents.strategy_controller import apply_strategy

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
        self._ws = None
        # Agent lookup by wallet address — populated during _run_match
        self._agents: dict[str, GameAgent] = {}
        # Queue for WS messages received during a match (strategy updates, stop)
        self._incoming_queue: asyncio.Queue = asyncio.Queue()

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
        uri = f"{ARENA_WS_URL}/emulator/ws"
        logger.info(f"Connecting to arena at {uri}...")

        async with websockets.connect(uri) as ws:
            logger.info("Connected to arena")
            self._ws = ws

            # Announce readiness
            ready = EmulatorReadyMessage(
                emulator_id=self.emulator_id,
                supported_games=["mariokart64", "streetfighter2"],
                max_agents=4,
            )
            await ws.send(ready.to_json())
            logger.info(f"Sent ready message: {self.emulator_id}")

            # Read all WS messages into a queue. A separate task (_run_match)
            # consumes strategy_update/stop messages during a race.
            async for raw in ws:
                import json as _json
                data = _json.loads(raw)
                msg_type = data.get("type", "")

                if msg_type == "start_match" and not self._running:
                    cmd = ArenaStartMatchCommand.from_json(raw)
                    # Run match as a concurrent task so WS reader continues
                    self._match_task = asyncio.create_task(self._run_match(ws, cmd))
                elif self._running:
                    # During match: queue for the race loop to drain
                    await self._incoming_queue.put(raw)
                elif msg_type == "stop_match":
                    logger.info(f"Stop match command (no active match)")
                elif msg_type == "strategy_update":
                    logger.info("Strategy update received but no active match")
                else:
                    logger.warning(f"Unknown message type: {msg_type}")

    def _handle_strategy_update(self, raw: str):
        """Apply an external agent's strategy update to the running agent."""
        cmd = ArenaStrategyUpdateCommand.from_json(raw)
        agent = self._agents.get(cmd.agent_id)
        if agent is None:
            logger.warning(f"Strategy update for unknown agent {cmd.agent_id}")
            return
        applied = apply_strategy(
            agent,
            strategy=cmd.strategy,
            target=cmd.target,
            item_policy=cmd.item_policy,
        )
        if applied:
            logger.info(
                f"Strategy applied for {cmd.agent_id}: {cmd.strategy} "
                f"(reason: {cmd.reasoning[:80]})"
            )

    def _drain_incoming_queue(self):
        """Process all queued WS messages (strategy updates, stop commands)."""
        import json as _json
        while not self._incoming_queue.empty():
            try:
                raw = self._incoming_queue.get_nowait()
                data = _json.loads(raw)
                msg_type = data.get("type", "")
                if msg_type == "stop_match":
                    logger.info("Stop command received during match")
                    self._running = False
                elif msg_type == "strategy_update":
                    self._handle_strategy_update(raw)
                else:
                    logger.warning(f"Unexpected message during match: {msg_type}")
            except Exception:
                break

    async def _run_match(self, ws, cmd: ArenaStartMatchCommand):
        """
        Run a full match. Dispatches to game-specific runner based on game_type.
        """
        game_type = getattr(cmd, "game_type", "mariokart64")
        if game_type == "streetfighter2":
            return await self._run_sf2_match(ws, cmd)
        return await self._run_mk64_match(ws, cmd)

    async def _run_mk64_match(self, ws, cmd: ArenaStartMatchCommand):
        """Run a Mario Kart 64 match (original flow)."""
        self._match_id = cmd.match_id
        self._running = True
        n_agents = len(cmd.agents)
        logger.info(f"Starting MK64 match {cmd.match_id}: {n_agents} agents, track={cmd.track_id}")

        try:
            # Create environment
            self.env = MarioKart64MultiAgentEnv(
                n_agents=n_agents,
                track_id=cmd.track_id,
                total_laps=cmd.total_laps,
            )

            # Create rule-based agents for each slot
            agents = []
            for i, addr in enumerate(cmd.agents):
                agent = RuleBasedAgent(
                    name=f"agent-{i}",
                    owner_wallet=addr,
                    agent_wallet=addr,
                )
                agents.append((addr, agent))
                self._agents[addr] = agent

            self.env.register_agents(agents)

            logger.info("Calling env.reset() — this may take 15-30s per instance (menu navigation)...")
            t0 = time.time()
            observations = self.env.reset()
            logger.info(f"env.reset() completed in {time.time() - t0:.1f}s")

            tick = 0
            use_stub_timing = not GYM_AVAILABLE

            while self._running:
                tick += 1

                # Process any queued strategy updates or stop commands
                self._drain_incoming_queue()

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
            self._agents.clear()
            self._running = False


    async def _run_sf2_match(self, ws, cmd: ArenaStartMatchCommand):
        """
        Run a Street Fighter II match.
        Uses native 2-player Genesis env (single instance, no multi-process).
        """
        from emulator.envs.sf2_retro import StreetFighter2RetroEnv, sf2_move_to_action, MAX_HEALTH
        from emulator.agents.sf2_agent import SF2Agent, SF2Observation as AgentSF2Obs
        import base64
        from io import BytesIO
        from PIL import Image

        self._match_id = cmd.match_id
        self._running = True
        logger.info(f"Starting SF2 match {cmd.match_id}: {cmd.agents}")

        sf2_env = None
        try:
            sf2_env = StreetFighter2RetroEnv()

            # Create SF2 agents
            agent_map = {}
            for i, addr in enumerate(cmd.agents[:2]):
                agent = SF2Agent(
                    name=f"agent-{i}",
                    player_index=i,
                    strategy="balanced",
                )
                agent_map[f"agent_{i}"] = (addr, agent)
                self._agents[addr] = agent

            logger.info("Calling sf2_env.reset()...")
            observations = sf2_env.reset()
            logger.info(f"SF2 env reset complete")

            tick = 0
            frame_interval = 3  # send frame every 3rd tick (~20fps)

            while self._running:
                tick += 1

                # Process strategy updates
                self._drain_incoming_queue()

                # Collect actions from both agents
                actions = {}
                for slot_id, (addr, agent) in agent_map.items():
                    obs = observations.get(slot_id)
                    if obs and not obs.finished:
                        # Convert env observation to agent observation format
                        agent_obs = AgentSF2Obs(
                            my_health=obs.health / MAX_HEALTH,
                            opp_health=obs.enemy_health / MAX_HEALTH,
                            distance=0.5,  # no spatial data in RAM
                            frame=tick,
                            round_over=obs.health <= 0 or obs.enemy_health <= 0,
                        )
                        action_arr = agent.decide_action(agent_obs)
                        actions[slot_id] = action_arr

                # Step env
                observations, rewards, done, info = sf2_env.step(actions)

                # Build tick message with SF2 state mapped to EmulatorPlayerState
                players = []
                for slot_id, (addr, agent) in agent_map.items():
                    obs = observations.get(slot_id)
                    if obs:
                        players.append(EmulatorPlayerState(
                            agent_id=addr,
                            player_index=int(slot_id[-1]),
                            x=float(obs.health),         # health as x (0-176)
                            y=float(obs.enemy_health),    # enemy health as y
                            position=obs.matches_won + 1, # rounds won + 1
                            lap=obs.round,                # current round
                            total_laps=3,                 # best of 3
                            speed=float(obs.health),      # health as speed (for UI compat)
                            item=None,
                            finished=obs.finished,
                            finish_time_ms=tick * 16 if obs.finished else 0,
                        ))

                # Encode frame as base64 JPEG (every Nth tick)
                frame_b64 = None
                if tick % frame_interval == 0:
                    frame = sf2_env.get_frame()
                    if frame is not None:
                        try:
                            img = Image.fromarray(frame)
                            # Scale up 2x for visibility
                            img = img.resize((512, 400), Image.NEAREST)
                            buf = BytesIO()
                            img.save(buf, format="JPEG", quality=60)
                            frame_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                        except Exception:
                            pass

                tick_msg = EmulatorTickMessage(
                    match_id=cmd.match_id,
                    tick=tick,
                    race_status="finished" if done else "in_progress",
                    players=players,
                    timestamp_ms=int(time.time() * 1000),
                    frame_b64=frame_b64,
                )
                await ws.send(tick_msg.to_json())

                if done:
                    break

                # Genesis runs at 60fps — env.step() is fast, add small sleep
                await asyncio.sleep(0.016)  # ~60fps

            # Build race end result
            winner_slot = sf2_env.winner
            zero = "0x" + "0" * 40
            agents_padded = list(cmd.agents[:2]) + [zero] * (4 - len(cmd.agents[:2]))

            # Map winner to final positions
            final_positions = [0, 0, 0, 0]
            finish_times = [0, 0, 0, 0]
            for i, addr in enumerate(cmd.agents[:2]):
                slot_id = f"agent_{i}"
                if slot_id == winner_slot:
                    final_positions[i] = 1
                else:
                    final_positions[i] = 2
                finish_times[i] = tick * 16

            end_msg = EmulatorRaceEndMessage(
                match_id=cmd.match_id,
                agents=agents_padded,
                final_positions=final_positions,
                finish_times_ms=finish_times,
                track_id=0,
                timestamp_ms=int(time.time() * 1000),
            )
            await ws.send(end_msg.to_json())
            logger.info(f"SF2 match {cmd.match_id} complete. Winner: {winner_slot}")

        except Exception as e:
            logger.error(f"SF2 match {cmd.match_id} failed: {e}", exc_info=True)
        finally:
            if sf2_env:
                sf2_env.close()
            self._agents.clear()
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
