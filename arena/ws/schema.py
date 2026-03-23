"""
Canonical WebSocket message schema for arena → frontend communication.
This is the SINGLE SOURCE OF TRUTH for all WebSocket message types.
DO NOT define or redefine these types elsewhere.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
import json


@dataclass
class PlayerState:
    """Per-player state within a race tick."""
    agent_id: str          # agent identifier
    wallet_address: str    # agent's EOA address
    model_name: str        # e.g. "claude-sonnet-4-6"
    character: str         # e.g. "toad", "mario"
    position: int          # 1-4 race position
    lap: int               # current lap (1-indexed)
    total_laps: int        # total laps in race
    item: Optional[str]    # current item held, None if none
    speed: float           # current speed
    x: float               # track X coordinate
    y: float               # track Y coordinate
    gap_to_leader_ms: int  # gap to leader in milliseconds (0 for leader)
    finished: bool         # has crossed finish line


@dataclass
class RaceTickMessage:
    """
    Per-frame game state. Sent every 100ms.
    type: "race_tick"
    """
    type: str = "race_tick"
    match_id: str = ""
    tick: int = 0
    race_status: str = "in_progress"  # "waiting" | "in_progress" | "finished"
    players: list[PlayerState] = field(default_factory=list)
    timestamp_ms: int = 0
    frame_b64: Optional[str] = None   # base64 JPEG game frame (SF2 only)

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class RaceStartMessage:
    """
    Match metadata sent once at race start.
    type: "race_start"
    """
    type: str = "race_start"
    match_id: str = ""
    track_id: int = 0
    track_name: str = ""
    agents: list[PlayerState] = field(default_factory=list)
    wager_amounts: dict[str, int] = field(default_factory=dict)  # agent_id -> amount in tinybars
    prediction_pool_address: str = ""
    hcs_match_topic_id: str = ""  # HCS topic for match messages
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class RaceEndMessage:
    """
    Final race result. Sent once when race completes.
    type: "race_end"
    """
    type: str = "race_end"
    match_id: str = ""
    final_positions: dict[str, int] = field(default_factory=dict)  # agent_id -> position
    finish_times_ms: dict[str, int] = field(default_factory=dict)  # agent_id -> finish time ms (0 = DNF)
    match_result_hash: str = ""   # EIP-712 hash of MarioKartResult
    hcs_sequence_number: int = 0  # HCS sequence number for this match's proof message
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class BettingUpdateMessage:
    """
    Pool totals per agent. Sent every 1-2s during race.
    type: "betting_update"
    """
    type: str = "betting_update"
    match_id: str = ""
    pool_totals: dict[str, int] = field(default_factory=dict)  # agent_id -> total tinybars bet
    total_pool_wei: int = 0
    implied_odds: dict[str, float] = field(default_factory=dict)  # agent_id -> implied probability
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class AgentReasoningMessage:
    """
    LLM reasoning text per agent, for dashboard live display.
    type: "agent_reasoning"
    """
    type: str = "agent_reasoning"
    match_id: str = ""
    agent_id: str = ""
    reasoning_text: str = ""   # raw LLM output shown in agent cam
    action_taken: str = ""     # e.g. "ACCELERATE STRAIGHT USE_ITEM:no"
    timestamp_ms: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))


# All message types — used by gen_ws_types.py
ALL_MESSAGE_TYPES = [
    RaceTickMessage,
    RaceStartMessage,
    RaceEndMessage,
    BettingUpdateMessage,
    AgentReasoningMessage,
]

# Shared sub-types also exported for type generation
ALL_SUB_TYPES = [
    PlayerState,
]
