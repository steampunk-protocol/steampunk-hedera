"""
Emulator -> Arena internal WebSocket message schema.
SINGLE SOURCE OF TRUTH — arena imports from arena/emulator_schema/ which mirrors this.

This is the internal channel between the emulator (running in Docker) and
the arena server. It carries raw game state at emulator tick rate (~60fps).
The arena then downsamples and repackages into arena/ws/schema.py messages
for the frontend (~10fps).

Flow:
    Emulator (Docker) -> WS -> Arena (FastAPI) -> WS -> Frontend (Next.js)
    [this schema]                                [arena/ws/schema.py]
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
import json


@dataclass
class EmulatorPlayerState:
    """Per-player raw state from the emulator. One per agent per tick."""
    agent_id: str              # agent wallet address (Hedera EVM address)
    player_index: int          # 0-3 controller slot
    x: float                   # track X coordinate
    y: float                   # track Y coordinate
    position: int              # race position 1-4
    lap: int                   # current lap (1-indexed)
    total_laps: int            # total laps in race
    speed: float               # current speed
    item: Optional[str]        # item name or None
    finished: bool             # crossed finish line
    finish_time_ms: int        # 0 if not finished


@dataclass
class EmulatorTickMessage:
    """
    Per-frame game state from emulator to arena.
    Sent at emulator tick rate (~60fps, or as fast as emulator runs).
    type: "emulator_tick"
    """
    type: str = "emulator_tick"
    match_id: str = ""
    tick: int = 0
    race_status: str = "in_progress"   # "waiting" | "in_progress" | "finished"
    players: list[EmulatorPlayerState] = field(default_factory=list)
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "EmulatorTickMessage":
        data = json.loads(raw)
        players = [EmulatorPlayerState(**p) for p in data.pop("players", [])]
        return cls(players=players, **data)


@dataclass
class EmulatorRaceEndMessage:
    """
    Final race result from emulator to arena.
    Sent once when all players finish or race times out.
    type: "emulator_race_end"
    """
    type: str = "emulator_race_end"
    match_id: str = ""
    agents: list[str] = field(default_factory=list)          # [4] zero-padded
    final_positions: list[int] = field(default_factory=list)  # [4]
    finish_times_ms: list[int] = field(default_factory=list)  # [4]
    track_id: int = 0
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "EmulatorRaceEndMessage":
        return cls(**json.loads(raw))


@dataclass
class EmulatorReadyMessage:
    """
    Emulator signals it has loaded the ROM and is ready to start a match.
    Sent once on connection.
    type: "emulator_ready"
    """
    type: str = "emulator_ready"
    emulator_id: str = ""
    supported_games: list[str] = field(default_factory=list)  # ["mariokart64"]
    max_agents: int = 4

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "EmulatorReadyMessage":
        return cls(**json.loads(raw))


@dataclass
class ArenaStartMatchCommand:
    """
    Arena tells emulator to start a match.
    Sent from arena to emulator over the internal WS.
    type: "start_match"
    """
    type: str = "start_match"
    match_id: str = ""
    agents: list[str] = field(default_factory=list)  # wallet addresses (Hedera EVM addresses)
    track_id: int = 0
    total_laps: int = 3

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ArenaStartMatchCommand":
        return cls(**json.loads(raw))


@dataclass
class ArenaStopMatchCommand:
    """
    Arena tells emulator to abort a match.
    type: "stop_match"
    """
    type: str = "stop_match"
    match_id: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ArenaStopMatchCommand":
        return cls(**json.loads(raw))


@dataclass
class ArenaStrategyUpdateCommand:
    """
    Arena forwards an external agent's strategy update to the emulator.
    Emulator applies this to the running agent's RuleBasedAgent params.
    type: "strategy_update"
    """
    type: str = "strategy_update"
    match_id: str = ""
    agent_id: str = ""                         # wallet address of the agent
    strategy: str = "balanced"                 # aggressive | defensive | balanced | item_focus
    target: str = "none"                       # leader | nearest | none
    item_policy: str = "immediate"             # immediate | save_for_straight | save_for_opponent
    reasoning: str = ""                        # LLM reasoning text (published to HCS)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ArenaStrategyUpdateCommand":
        return cls(**json.loads(raw))
