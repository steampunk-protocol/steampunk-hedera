"""
RaceRunner — orchestrates a complete match lifecycle (Hedera port).

Two modes:
  A. Emulator mode (default): dispatches to a connected emulator via WS bridge.
     Emulator runs the game, streams ticks → bridge broadcasts to frontend.
     RaceRunner waits for race_end, then handles settlement.

  B. Local adapter mode (fallback): uses MK64GameAdapter stub when no emulator
     is connected. RaceRunner polls adapter and broadcasts ticks itself.

Hedera-specific changes:
- CHAIN_ID defaults to 296 (Hedera testnet via JSON-RPC Relay)
- RPC_URL defaults to https://testnet.hashio.io/api
- ERC-8004 ReputationRegistry calls removed — ELO stored in DB only (MVP)
- After settlement, publishes match result to HCS via arena/hcs/publisher.py

Anti-duplication rules enforced here:
- Broadcasts ONLY via arena/ws/broadcaster.py
- Signs ONLY via arena/oracle/signer.py
- Calculates Elo ONLY via arena/elo/calculator.py
- Publishes HCS ONLY via arena/hcs/publisher.py
"""
from __future__ import annotations
import asyncio
import logging
import os
import time
from typing import Optional

from arena.adapters.base import GameAdapter
from arena.adapters.mariokart64 import MK64GameAdapter
from arena.ws.broadcaster import manager
from arena.ws.schema import (
    RaceStartMessage, RaceTickMessage, RaceEndMessage,
    BettingUpdateMessage, PlayerState
)
from arena.oracle.signer import sign_result, encode_result_for_submission, DEFAULT_CHAIN_ID
from arena.elo.calculator import calculate_elo_deltas
from arena.db.models import AsyncSessionLocal, AgentModel, MatchModel
from arena.utils import match_id_to_uint256

logger = logging.getLogger(__name__)

TICK_INTERVAL_S = 0.1   # 100ms between state broadcasts
BETTING_UPDATE_INTERVAL_S = 1.5  # betting odds update interval
EMULATOR_RACE_TIMEOUT_S = 300.0  # 5 min max race duration

# Hedera defaults
DEFAULT_RPC_URL = "https://testnet.hashio.io/api"
HCS_MATCH_RESULTS_TOPIC = os.environ.get("HCS_MATCH_RESULTS_TOPIC", "")


class RaceRunner:
    """
    Runs a complete match from start to settlement.

    Usage:
        runner = RaceRunner(match_id="...", agents=["0xA...", "0xB..."])
        await runner.run()
    """

    def __init__(
        self,
        match_id: str,
        agents: list[str],   # agent wallet addresses
        track_id: int = 0,
        adapter: Optional[GameAdapter] = None,
        game_type: str = "mariokart64",
    ):
        self.match_id = match_id
        self.agents = [a.lower() for a in agents]
        self.track_id = track_id
        self.game_type = game_type
        # Allow injecting adapter for testing (forces local mode)
        self._injected_adapter = adapter
        self.adapter = adapter or MK64GameAdapter(
            n_agents=len(agents),
            track_id=track_id,
        )
        self._tick = 0
        self._start_time_ms: int = 0

    async def run(self) -> dict:
        """
        Run the full match lifecycle.
        Returns the final race result dict.
        """
        logger.info(f"RaceRunner starting: match={self.match_id}, agents={self.agents}")

        # Try emulator mode first (unless adapter was injected for testing)
        if self._injected_adapter is None:
            result = await self._try_emulator_mode()
            if result is not None:
                return result

        # Fallback: local adapter mode
        logger.info(f"Running match {self.match_id} in local adapter mode")
        return await self._run_local_mode()

    async def _try_emulator_mode(self) -> Optional[dict]:
        """
        Attempt to dispatch the match to a connected emulator.
        Returns the race result if successful, None if no emulator available.
        """
        from arena.ws.emulator_bridge import emulator_registry

        emu = await emulator_registry.get_available(game=self.game_type)
        if emu is None:
            logger.info(f"No emulator available for match {self.match_id}, falling back to local adapter")
            return None

        logger.info(f"Dispatching match {self.match_id} to emulator {emu.emulator_id}")

        try:
            # Send start command to emulator
            await emu.send_start_match(
                match_id=self.match_id,
                agents=self.agents,
                track_id=self.track_id,
                total_laps=3,
                game_type=self.game_type,
            )
            self._start_time_ms = int(time.time() * 1000)

            # Broadcast RaceStartMessage to frontend
            await self._broadcast_start()

            # Wait for emulator to finish — bridge handles tick broadcasting
            result = await emu.wait_for_race_end(timeout=EMULATOR_RACE_TIMEOUT_S)
            logger.info(f"Emulator completed match {self.match_id}")

            # Settlement (signing, Elo, on-chain, HCS)
            await self._settle(result)
            return result

        except asyncio.TimeoutError:
            logger.error(f"Emulator timed out for match {self.match_id}")
            await emu.send_stop_match(self.match_id)
            raise
        except Exception as e:
            logger.error(f"Emulator mode failed for match {self.match_id}: {e}")
            await emu.send_stop_match(self.match_id)
            raise

    async def _run_local_mode(self) -> dict:
        """Run match using local GameAdapter (stub or real)."""
        try:
            await self._start_match()
            await self._broadcast_start()
            result = await self._run_race_loop()
            await self._settle(result)
            return result
        except Exception as e:
            logger.error(f"RaceRunner error: {e}")
            await self.adapter.stop_match()
            raise

    async def _start_match(self) -> None:
        """Initialize the game adapter and record start time."""
        await self.adapter.start_match(self.match_id, self.agents)
        self._start_time_ms = int(time.time() * 1000)
        logger.info(f"Match started: {self.match_id}")

    async def _broadcast_start(self) -> None:
        """Broadcast RaceStartMessage to all connected WebSocket clients."""
        players = [
            PlayerState(
                agent_id=addr,
                wallet_address=addr,
                model_name="unknown",
                character="toad",
                position=i + 1,
                lap=1,
                total_laps=3,
                item=None,
                speed=0.0,
                x=0.0,
                y=0.0,
                gap_to_leader_ms=0,
                finished=False,
            )
            for i, addr in enumerate(self.agents)
        ]
        msg = RaceStartMessage(
            match_id=self.match_id,
            track_id=self.track_id,
            track_name=f"Track {self.track_id}",
            agents=players,
            wager_amounts={addr: 0 for addr in self.agents},
            prediction_pool_address=os.environ.get("PREDICTION_POOL_ADDRESS", ""),
            hcs_match_topic_id=HCS_MATCH_RESULTS_TOPIC,
            timestamp_ms=self._start_time_ms,
        )
        await manager.broadcast_start(self.match_id, msg)

        # Lock prediction pool on-chain (pool was created at match creation in queue.py)
        from arena.pool_lifecycle import lock_pool_on_chain
        await lock_pool_on_chain(self.match_id)

    async def _run_race_loop(self) -> dict:
        """
        Poll game state until race finishes. Broadcasts ticks and betting updates.
        Returns final race result dict (local adapter mode only).
        """
        from arena.oracle.reader import read_race_result

        last_betting_update = time.monotonic()

        while True:
            state = await self.adapter.get_race_state()
            self._tick += 1

            # Build and broadcast tick message
            players = self._state_to_player_states(state)
            tick_msg = RaceTickMessage(
                match_id=self.match_id,
                tick=self._tick,
                race_status=state.get("race_status", "in_progress"),
                players=players,
                timestamp_ms=int(time.time() * 1000),
            )
            await manager.broadcast_tick(self.match_id, tick_msg)

            # Periodic betting update (stub odds for MVP)
            now = time.monotonic()
            if now - last_betting_update >= BETTING_UPDATE_INTERVAL_S:
                await self._broadcast_betting_update(players)
                last_betting_update = now

            # Check for race end
            if state.get("race_status") == "finished":
                logger.info(f"Race finished: match={self.match_id}, tick={self._tick}")
                break

            await asyncio.sleep(TICK_INTERVAL_S)

        # Collect final result
        result = await read_race_result(self.adapter)
        return result

    async def _settle(self, result: dict) -> None:
        """
        Post-race settlement:
        1. Encode and normalize result
        2. Sign with arena key (EIP-712 via Hedera JSON-RPC Relay)
        3. Submit to MatchProof.submitResult() on-chain
        4. Settle Wager on-chain
        5. Load current Elo from DB, calculate deltas, update DB (no on-chain ELO — MVP)
        6. Publish match result to HCS topic
        7. Store match result in DB
        8. Broadcast RaceEndMessage to frontend via WS

        On-chain calls are wrapped in try/except so failures do not crash the match.
        WS broadcast and DB writes always happen regardless of on-chain outcomes.
        """
        normalized = encode_result_for_submission(result)
        # Convert UUID match_id to deterministic uint256 for on-chain use
        normalized["matchId"] = match_id_to_uint256(self.match_id)
        match_result_hash = ""
        on_chain_tx = None
        hcs_sequence_number = None

        # ── 1. Sign with arena key ──
        arena_key = os.environ.get("ARENA_PRIVATE_KEY", "") or os.environ.get("ORACLE_PRIVATE_KEY", "") or os.environ.get("DEPLOYER_KEY", "")
        arena_account = None
        sig = None
        contract_address = os.environ.get("MATCH_PROOF_ADDRESS", "0x" + "0" * 40)
        wager_address = os.environ.get("WAGER_ADDRESS", "")
        chain_id = int(os.environ.get("CHAIN_ID", str(DEFAULT_CHAIN_ID)))
        rpc_url = os.environ.get("RPC_URL", DEFAULT_RPC_URL)

        if arena_key:
            from eth_account import Account
            arena_account = Account.from_key(arena_key if arena_key.startswith("0x") else "0x" + arena_key)
            sig = sign_result(arena_account, normalized, contract_address, chain_id)
            logger.info(f"Arena signed result for match {self.match_id}")
        else:
            logger.warning("ARENA_PRIVATE_KEY not set — skipping on-chain signature")

        # ── 2+3+3b. On-chain calls in parallel (independent, each wrapped in try/except) ──
        from arena.pool_lifecycle import settle_pool_on_chain, settle_wager_on_chain
        winner_for_pool = None
        wager_settle_tx = None
        for addr, pos in zip(normalized["agents"], normalized["finalPositions"]):
            if pos == 1 and addr != "0x" + "0" * 40:
                winner_for_pool = addr
                break

        async def _submit_proof():
            nonlocal on_chain_tx, match_result_hash
            if arena_account and rpc_url and contract_address != "0x" + "0" * 40:
                try:
                    on_chain_tx, match_result_hash = await asyncio.to_thread(
                        self._submit_match_proof_sync,
                        rpc_url, contract_address, normalized, sig, arena_account,
                    )
                except Exception as e:
                    logger.error(f"MatchProof.submitResult() tx reverted: {e}")

        async def _settle_wager():
            nonlocal wager_settle_tx
            if winner_for_pool:
                wager_settle_tx = await settle_wager_on_chain(
                    self.match_id, normalized["matchId"], winner_for_pool
                )

        async def _settle_pool():
            if winner_for_pool:
                await settle_pool_on_chain(self.match_id, normalized["matchId"], winner_for_pool)

        await asyncio.gather(_submit_proof(), _settle_wager(), _settle_pool())

        # ── 4. Load current Elo from DB, calculate deltas, persist ──
        current_ratings = {}
        try:
            from sqlalchemy import select
            async with AsyncSessionLocal() as session:
                for addr in self.agents:
                    stmt = select(AgentModel).where(AgentModel.address == addr.lower())
                    row = (await session.execute(stmt)).scalar_one_or_none()
                    current_ratings[addr] = row.elo if row else 1200
        except Exception as e:
            logger.warning(f"Failed to load Elo from DB, using defaults: {e}")
            current_ratings = {addr: 1200 for addr in self.agents}

        elo_deltas = calculate_elo_deltas(
            agents=normalized["agents"],
            final_positions=normalized["finalPositions"],
            current_ratings=current_ratings,
        )
        logger.info(f"Elo deltas: {elo_deltas}")

        # Persist updated Elo back to DB
        try:
            from sqlalchemy import select
            async with AsyncSessionLocal() as session:
                for addr, delta in elo_deltas.items():
                    if addr == "0x" + "0" * 40:
                        continue
                    stmt = select(AgentModel).where(AgentModel.address == addr.lower())
                    row = (await session.execute(stmt)).scalar_one_or_none()
                    if row:
                        row.elo = (row.elo or 1200) + delta
                        row.matches_played = (row.matches_played or 0) + 1
                        session.add(row)
                await session.commit()
                logger.info(f"Elo persisted to DB for match {self.match_id}")
        except Exception as e:
            logger.error(f"Failed to persist Elo to DB: {e}")

        # ── 5. Publish match result to HCS ──
        winner_address_db = None
        for addr, pos in zip(normalized["agents"], normalized["finalPositions"]):
            if pos == 1 and addr != "0x" + "0" * 40:
                winner_address_db = addr.lower()
                break

        # Compute fallback proof_hash if on-chain hash unavailable
        # keccak256(abi.encodePacked(match_id, winner, timestamp))
        proof_hash_for_hcs = match_result_hash
        if not proof_hash_for_hcs and winner_address_db:
            try:
                from web3 import Web3
                proof_hash_for_hcs = Web3.solidity_keccak(
                    ["string", "address", "uint256"],
                    [self.match_id, Web3.to_checksum_address(winner_address_db), normalized["timestamp"]],
                ).hex()
                proof_hash_for_hcs = "0x" + proof_hash_for_hcs if not proof_hash_for_hcs.startswith("0x") else proof_hash_for_hcs
            except Exception as e:
                logger.warning(f"Failed to compute fallback proof_hash: {e}")
                proof_hash_for_hcs = ""

        hcs_topic = HCS_MATCH_RESULTS_TOPIC
        if hcs_topic:
            try:
                from arena.hcs.publisher import publish_match_result
                hcs_sequence_number = await publish_match_result(
                    topic_id=hcs_topic,
                    match_id=self.match_id,
                    winner=winner_address_db or "",
                    proof_hash=proof_hash_for_hcs or "",
                )
                if hcs_sequence_number is not None:
                    logger.info(
                        f"Match result published to HCS: topic={hcs_topic}, "
                        f"match={self.match_id}, seq={hcs_sequence_number}"
                    )
            except Exception as e:
                logger.error(f"HCS publish failed for match {self.match_id}: {e}")
        else:
            logger.warning("HCS_MATCH_RESULTS_TOPIC not set — skipping HCS publish")

        # ── 6. Store match result in DB ──
        try:
            from sqlalchemy import select
            async with AsyncSessionLocal() as session:
                stmt = select(MatchModel).where(MatchModel.match_id == self.match_id)
                match_row = (await session.execute(stmt)).scalar_one_or_none()
                if match_row:
                    match_row.status = "settled"
                    match_row.ended_at = int(time.time() * 1000)
                    match_row.winner_address = winner_address_db
                    match_row.match_result_hash = match_result_hash or None
                    match_row.on_chain_tx = on_chain_tx
                    match_row.hcs_message_id = str(hcs_sequence_number) if hcs_sequence_number is not None else None
                    session.add(match_row)
                    await session.commit()
                    logger.info(f"Match result stored in DB: {self.match_id}")
                else:
                    logger.warning(f"MatchModel not found for {self.match_id} — skipping DB update")
        except Exception as e:
            logger.error(f"Failed to store match result in DB: {e}")

        # ── 7. Broadcast RaceEndMessage ──
        final_positions = {}
        finish_times = {}
        for addr, pos, ft in zip(
            normalized["agents"], normalized["finalPositions"], normalized["finishTimes"]
        ):
            if addr != "0x" + "0" * 40:
                final_positions[addr] = pos
                finish_times[addr] = ft

        end_msg = RaceEndMessage(
            match_id=self.match_id,
            final_positions=final_positions,
            finish_times_ms=finish_times,
            match_result_hash=match_result_hash or "",
            hcs_sequence_number=hcs_sequence_number or 0,
            timestamp_ms=int(time.time() * 1000),
        )
        await manager.broadcast_end(self.match_id, end_msg)

        # ── 8. Stop adapter ──
        if self._injected_adapter is not None or not hasattr(self, '_emulator_mode'):
            await self.adapter.stop_match()

        logger.info(f"Match settled: {self.match_id}")

    def _submit_match_proof_sync(self, rpc_url, contract_address, normalized, sig, arena_account):
        """Blocking on-chain call — run via asyncio.to_thread()."""
        from web3 import Web3
        import json as _json
        from pathlib import Path

        w3 = Web3(Web3.HTTPProvider(rpc_url))
        abis_dir = Path(__file__).parent.parent / "contracts" / "abis"
        with open(abis_dir / "MatchProof.json") as f:
            abi_data = _json.load(f)
        match_proof_abi = abi_data.get("abi", abi_data)

        match_proof = w3.eth.contract(
            address=Web3.to_checksum_address(contract_address),
            abi=match_proof_abi,
        )

        result_tuple = (
            [Web3.to_checksum_address(a) for a in normalized["agents"]],
            normalized["finalPositions"],
            normalized["finishTimes"],
            normalized["trackId"],
            normalized["matchId"],
            normalized["timestamp"],
        )

        tx = match_proof.functions.submitResult(
            result_tuple,
            sig,
        ).build_transaction({
            "from": arena_account.address,
            "nonce": w3.eth.get_transaction_count(arena_account.address),
            "gas": 500000,
            "gasPrice": 1_500_000_000_000,
        })
        signed_tx = arena_account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        on_chain_tx = ""
        match_result_hash = ""
        if receipt.status == 1:
            on_chain_tx = tx_hash.hex()
            logger.info(f"MatchProof.submitResult() succeeded: tx={on_chain_tx}")
            raw_hash = match_proof.functions.getResultHash(result_tuple).call()
            match_result_hash = "0x" + raw_hash.hex()
        else:
            logger.error(f"MatchProof.submitResult() tx reverted: {tx_hash.hex()}")

        return on_chain_tx, match_result_hash

    def _settle_wager_sync(self, rpc_url, wager_address, normalized, arena_account):
        """Blocking on-chain call — run via asyncio.to_thread()."""
        from web3 import Web3
        import json as _json
        from pathlib import Path

        w3 = Web3(Web3.HTTPProvider(rpc_url))
        abis_dir = Path(__file__).parent.parent / "contracts" / "abis"
        with open(abis_dir / "Wager.json") as f:
            abi_data = _json.load(f)
        wager_abi = abi_data.get("abi", abi_data)

        wager_contract = w3.eth.contract(
            address=Web3.to_checksum_address(wager_address),
            abi=wager_abi,
        )

        winner_address = None
        for addr, pos in zip(normalized["agents"], normalized["finalPositions"]):
            if pos == 1 and addr != "0x" + "0" * 40:
                winner_address = addr
                break

        if winner_address:
            tx = wager_contract.functions.settle(
                normalized["matchId"],
                Web3.to_checksum_address(winner_address),
            ).build_transaction({
                "from": arena_account.address,
                "nonce": w3.eth.get_transaction_count(arena_account.address),
                "gas": 300000,
            })
            signed_tx = arena_account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            if receipt.status == 1:
                logger.info(f"Wager.settle() succeeded for match {self.match_id}: winner={winner_address}")
            else:
                logger.error(f"Wager.settle() tx reverted: {tx_hash.hex()}")
        else:
            logger.warning(f"No winner found for match {self.match_id} — skipping Wager.settle()")

    async def _broadcast_betting_update(self, players: list[PlayerState]) -> None:
        """Broadcast stub betting odds (equal distribution for MVP)."""
        n = len(players)
        if n == 0:
            return
        pool_totals = {p.agent_id: 0 for p in players}
        implied_odds = {p.agent_id: round(1.0 / n, 4) for p in players}
        msg = BettingUpdateMessage(
            match_id=self.match_id,
            pool_totals=pool_totals,
            total_pool_wei=0,
            implied_odds=implied_odds,
            timestamp_ms=int(time.time() * 1000),
        )
        await manager.broadcast_betting(self.match_id, msg)

    def _state_to_player_states(self, state: dict) -> list[PlayerState]:
        """Convert adapter game state dict to list of PlayerState for WS broadcast."""
        players = []
        for i, p in enumerate(state.get("players", [])):
            players.append(PlayerState(
                agent_id=p.get("agent_id", f"agent_{i}"),
                wallet_address=p.get("agent_id", f"agent_{i}"),
                model_name=p.get("model_name", "unknown"),
                character=p.get("character", "toad"),
                position=p.get("position", i + 1),
                lap=p.get("lap", 1),
                total_laps=p.get("total_laps", 3),
                item=p.get("item"),
                speed=p.get("speed", 0.0),
                x=p.get("x", 0.0),
                y=p.get("y", 0.0),
                gap_to_leader_ms=p.get("gap_to_leader_ms", 0),
                finished=p.get("finished", False),
            ))
        return players
