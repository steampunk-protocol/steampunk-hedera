"""
GameAdapter ABC — decouples arena from any specific game.
All game-specific logic implements this interface.
arena/oracle/reader.py and arena/race_runner.py depend ONLY on this class.

Adding a new game = implement GameAdapter, zero arena changes required.
"""
from __future__ import annotations
from abc import ABC, abstractmethod


class GameAdapter(ABC):
    """
    Protocol between the arena server and any game emulator.
    Implement this for each game (MK64, Street Fighter, Chess, etc.)
    """

    @abstractmethod
    async def start_match(self, match_id: str, agents: list[str]) -> None:
        """
        Start a match with the given agents.

        Args:
            match_id: Unique match identifier.
            agents: List of agent wallet addresses (2-4).
        """
        ...

    @abstractmethod
    async def get_race_state(self) -> dict:
        """
        Get current normalized game state.
        Called every tick (~100ms) by arena to broadcast to frontend.

        Returns dict matching RaceTickMessage player fields:
        {
            "players": [
                {
                    "agent_id": str,
                    "position": int,       # 1-4
                    "lap": int,
                    "total_laps": int,
                    "item": str | None,
                    "speed": float,
                    "x": float,
                    "y": float,
                    "gap_to_leader_ms": int,
                    "finished": bool,
                }
            ],
            "race_status": str,  # "waiting" | "in_progress" | "finished"
            "tick": int,
        }
        """
        ...

    @abstractmethod
    async def get_race_result(self) -> dict:
        """
        Get final race result after race_status == "finished".
        Called once by oracle to build EIP-712 signed result.

        Returns dict matching MarioKartResult struct:
        {
            "agents": list[str],           # agent wallet addresses [4], zero-padded
            "finalPositions": list[int],   # [4], 0=DNF
            "finishTimes": list[int],      # [4] milliseconds, 0=DNF
            "trackId": int,
            "matchId": int,
            "timestamp": int,              # unix seconds
        }
        """
        ...

    @abstractmethod
    async def stop_match(self) -> None:
        """
        Stop the current match and clean up resources.
        Called on race end, timeout, or error.
        """
        ...


class GameAdapterError(Exception):
    """Raised when a GameAdapter operation fails."""
    pass
