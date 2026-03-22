"""
Emulator <-> Arena internal WebSocket message schema.
Ported from emulator/ws/internal_schema.py in the original Steampunk project.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
import json


@dataclass
class EmulatorPlayerState:
    agent_id: str
    player_index: int
    x: float
    y: float
    position: int
    lap: int
    total_laps: int
    speed: float
    item: Optional[str]
    finished: bool
    finish_time_ms: int


@dataclass
class EmulatorTickMessage:
    type: str = "emulator_tick"
    match_id: str = ""
    tick: int = 0
    race_status: str = "in_progress"
    players: list[EmulatorPlayerState] = field(default_factory=list)
    timestamp_ms: int = 0
    frame_b64: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "EmulatorTickMessage":
        data = json.loads(raw)
        players = [EmulatorPlayerState(**p) for p in data.pop("players", [])]
        return cls(players=players, **data)


@dataclass
class EmulatorRaceEndMessage:
    type: str = "emulator_race_end"
    match_id: str = ""
    agents: list[str] = field(default_factory=list)
    final_positions: list[int] = field(default_factory=list)
    finish_times_ms: list[int] = field(default_factory=list)
    track_id: int = 0
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "EmulatorRaceEndMessage":
        return cls(**json.loads(raw))


@dataclass
class EmulatorReadyMessage:
    type: str = "emulator_ready"
    emulator_id: str = ""
    supported_games: list[str] = field(default_factory=list)
    max_agents: int = 4

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "EmulatorReadyMessage":
        return cls(**json.loads(raw))


@dataclass
class ArenaStartMatchCommand:
    type: str = "start_match"
    match_id: str = ""
    agents: list[str] = field(default_factory=list)
    track_id: int = 0
    total_laps: int = 3
    game_type: str = "mariokart64"

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ArenaStartMatchCommand":
        return cls(**json.loads(raw))


@dataclass
class ArenaStopMatchCommand:
    type: str = "stop_match"
    match_id: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ArenaStopMatchCommand":
        return cls(**json.loads(raw))


@dataclass
class ArenaStrategyUpdateCommand:
    type: str = "strategy_update"
    match_id: str = ""
    agent_id: str = ""
    strategy: str = "balanced"
    target: str = "none"
    item_policy: str = "immediate"
    reasoning: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ArenaStrategyUpdateCommand":
        return cls(**json.loads(raw))
