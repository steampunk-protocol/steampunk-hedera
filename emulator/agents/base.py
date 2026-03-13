"""
GameAgent ABC — the universal agent interface.
ALL agents must extend this class. Never redefine observe/act elsewhere.

Single source of truth: emulator/agents/base.py
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Any


@dataclass
class AgentMetadata:
    """Metadata describing an agent."""
    name: str                    # human-readable name e.g. "claude-opus-racer"
    model: str                   # model identifier e.g. "claude-sonnet-4-6" or "rule-based"
    owner_wallet: str            # agent owner's Hedera address (0x... or 0.0.XXXXX)
    agent_wallet: str            # agent's own address for signing (0x... or 0.0.XXXXX)
    version: str = "1.0.0"


@dataclass
class Observation:
    """
    Normalized per-agent observation from the environment.
    Populated by MarioKart64MultiAgentEnv from RAM reads.
    """
    agent_id: str
    # Position on track
    x: float
    y: float
    # Race state
    position: int           # race position 1-4
    lap: int                # current lap (1-indexed)
    total_laps: int
    speed: float
    # Item
    item: Optional[str]     # None if no item held
    # Timing
    lap_time_ms: int        # current lap time in ms
    race_time_ms: int       # total race time in ms
    # Race completion
    finished: bool
    finish_time_ms: int     # 0 if not finished
    # Raw frame (optional — for vision-based agents)
    frame: Optional[Any] = None  # numpy array if captured, else None


@dataclass
class Action:
    """
    Controller action output from an agent.
    Maps to N64 controller buttons.
    """
    accelerate: bool = True     # A button
    brake: bool = False         # B button (also fire item)
    steer: float = 0.0          # -1.0 (full left) to 1.0 (full right)
    use_item: bool = False      # Z button
    hop: bool = False           # R button (hop/drift)

    def to_mupen64_input(self) -> dict:
        """Convert to mupen64plus input format (unused — stable-retro uses _action_to_retro in mariokart64_multi.py)."""
        return {
            "A_BUTTON": int(self.accelerate),
            "B_BUTTON": int(self.brake),
            "R_TRIG": int(self.hop),
            "Z_TRIG": int(self.use_item),
            "X_AXIS": int(self.steer * 127),  # -127 to 127
            "Y_AXIS": 0,
        }


class GameAgent(ABC):
    """
    Universal agent interface. All agents extend this.
    Never redefine observe/act/get_metadata outside this file.
    """

    @abstractmethod
    def observe(self, raw_state: dict) -> Observation:
        """
        Convert raw environment state dict to typed Observation.
        Called every frame by the environment.

        Args:
            raw_state: Dict from MarioKart64MultiAgentEnv containing
                       RAM reads for this agent's slot.

        Returns:
            Typed Observation for this agent.
        """
        ...

    @abstractmethod
    def act(self, observation: Observation) -> tuple[Action, str]:
        """
        Decide next action given current observation.

        Args:
            observation: Typed Observation from observe().

        Returns:
            Tuple of (Action, reasoning_text).
            reasoning_text is shown in the dashboard agent cam.
            Return empty string for non-LLM agents.
        """
        ...

    @abstractmethod
    def get_metadata(self) -> AgentMetadata:
        """
        Return agent metadata for matchmaking and display.
        Called once at agent registration.
        """
        ...

    def reset(self) -> None:
        """Called at the start of each race. Override if agent has state to reset."""
        pass
