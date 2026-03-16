"""
Strategy Controller — maps external agent strategy commands to RuleBasedAgent params.

Used by EmulatorService when receiving ArenaStrategyUpdateCommand from the arena.
Validates strategy values and applies them to the target agent.
"""
from __future__ import annotations
import logging
from typing import Optional

from emulator.agents.base import GameAgent
from emulator.agents.rule_based import RuleBasedAgent, STRATEGY_PRESETS

logger = logging.getLogger(__name__)

VALID_STRATEGIES = set(STRATEGY_PRESETS.keys())
VALID_TARGETS = {"leader", "nearest", "none"}
VALID_ITEM_POLICIES = {"immediate", "save_for_straight", "save_for_opponent"}


def apply_strategy(
    agent: GameAgent,
    strategy: str,
    target: str = "none",
    item_policy: str = "immediate",
) -> bool:
    """
    Apply a strategy update to an agent.

    Returns True if applied, False if agent type doesn't support strategy updates.
    """
    if not isinstance(agent, RuleBasedAgent):
        logger.warning(
            f"Agent {getattr(agent, 'name', '?')} is {type(agent).__name__}, "
            f"not RuleBasedAgent — strategy update ignored"
        )
        return False

    # Validate and clamp to known values
    if strategy not in VALID_STRATEGIES:
        logger.warning(f"Unknown strategy '{strategy}', falling back to 'balanced'")
        strategy = "balanced"
    if target not in VALID_TARGETS:
        target = "none"
    if item_policy not in VALID_ITEM_POLICIES:
        item_policy = "immediate"

    agent.update_strategy(strategy=strategy, target=target, item_policy=item_policy)
    return True
