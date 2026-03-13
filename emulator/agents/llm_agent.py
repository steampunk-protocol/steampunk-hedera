"""
LLMAgent — hybrid brain agent for Mario Kart 64.
Extends GameAgent ABC.

Architecture:
- Reflex layer: RuleBasedAgent runs every frame (fast, no API calls)
- LLM layer: Claude/GPT-4o called every ~1.5s for strategic overrides
- reasoning_text returned alongside action (shown in dashboard agent cam)
- Falls back to reflex silently on LLM timeout or error

Model configurable via LLM_MODEL env var (default: claude-sonnet-4-6).
"""
from __future__ import annotations
import os
import time
import logging
import threading
from typing import Optional

from emulator.agents.base import GameAgent, Observation, Action, AgentMetadata
from emulator.agents.rule_based import RuleBasedAgent

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_LLM_INTERVAL = 1.5   # seconds between LLM calls
LLM_TIMEOUT = 3.0             # seconds before giving up on LLM call


def _build_prompt(obs: Observation) -> str:
    """Build LLM prompt from current observation."""
    item_str = obs.item if obs.item else "none"
    return f"""You are racing in Mario Kart 64. Make a quick strategic decision.

Current state:
- Position: {obs.position}
- Lap: {obs.lap}/{obs.total_laps}
- Speed: {obs.speed:.0f}
- Item held: {item_str}
- Track X: {obs.x:.1f}

Reply with exactly one line in this format:
ACTION: [ACCELERATE|BRAKE] [LEFT|RIGHT|STRAIGHT] [ITEM:YES|ITEM:NO]
REASONING: <one sentence why>

Example:
ACTION: ACCELERATE STRAIGHT ITEM:YES
REASONING: Using item now to close gap to leader."""


def _parse_llm_response(text: str) -> tuple[Optional[Action], str]:
    """
    Parse LLM response into Action and reasoning text.
    Returns (None, reasoning) if parsing fails — caller uses reflex fallback.
    """
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    action_line = ""
    reasoning = ""

    for line in lines:
        if line.upper().startswith("ACTION:"):
            action_line = line.split(":", 1)[1].strip().upper()
        elif line.upper().startswith("REASONING:"):
            reasoning = line.split(":", 1)[1].strip()

    if not action_line:
        return None, text[:200]  # return raw text as reasoning

    parts = action_line.split()
    accelerate = "ACCELERATE" in parts
    brake = "BRAKE" in parts
    steer = -0.3 if "LEFT" in parts else (0.3 if "RIGHT" in parts else 0.0)
    use_item = "ITEM:YES" in parts

    return Action(
        accelerate=accelerate,
        brake=brake,
        steer=steer,
        use_item=use_item,
    ), reasoning


class LLMAgent(GameAgent):
    """
    Hybrid LLM + reflex agent.

    Reflex (RuleBasedAgent) runs every frame.
    LLM called every llm_interval seconds; overrides reflex action when available.
    Falls back to reflex on timeout/error.
    """

    def __init__(
        self,
        name: str = "llm-agent",
        model: str = "",
        owner_wallet: str = "",
        agent_wallet: str = "",
        llm_interval: float = DEFAULT_LLM_INTERVAL,
    ):
        self.name = name
        self.model = model or os.environ.get("LLM_MODEL", DEFAULT_MODEL)
        self.owner_wallet = owner_wallet
        self.agent_wallet = agent_wallet
        self.llm_interval = llm_interval

        self.reflex = RuleBasedAgent(
            name=f"{name}-reflex",
            owner_wallet=owner_wallet,
            agent_wallet=agent_wallet,
        )

        self._last_llm_time: float = 0.0
        self._last_llm_action: Optional[Action] = None
        self._last_reasoning: str = ""
        self._llm_lock = threading.Lock()

        # Lazy-init clients to avoid import errors when API keys not set
        self._anthropic_client = None
        self._openai_client = None

    def _get_anthropic_client(self):
        if self._anthropic_client is None:
            import anthropic
            self._anthropic_client = anthropic.Anthropic()
        return self._anthropic_client

    def _get_openai_client(self):
        if self._openai_client is None:
            import openai
            self._openai_client = openai.OpenAI()
        return self._openai_client

    def _call_llm(self, obs: Observation) -> tuple[Optional[Action], str]:
        """Call LLM and parse response. Returns (action, reasoning) or (None, '') on failure."""
        prompt = _build_prompt(obs)
        try:
            if "claude" in self.model.lower():
                client = self._get_anthropic_client()
                msg = client.messages.create(
                    model=self.model,
                    max_tokens=128,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = msg.content[0].text
            else:
                # OpenAI-compatible
                client = self._get_openai_client()
                resp = client.chat.completions.create(
                    model=self.model,
                    max_tokens=128,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = resp.choices[0].message.content

            return _parse_llm_response(text)

        except Exception as e:
            logger.warning(f"LLM call failed ({type(e).__name__}): {e} — using reflex fallback")
            return None, ""

    def _maybe_call_llm_async(self, obs: Observation) -> None:
        """Trigger async LLM call if interval has elapsed."""
        now = time.monotonic()
        if now - self._last_llm_time < self.llm_interval:
            return

        self._last_llm_time = now

        def _worker():
            action, reasoning = self._call_llm(obs)
            with self._llm_lock:
                if action is not None:
                    self._last_llm_action = action
                    self._last_reasoning = reasoning

        t = threading.Thread(target=_worker, daemon=True)
        t.start()

    def observe(self, raw_state: dict) -> Observation:
        return self.reflex.observe(raw_state)

    def act(self, observation: Observation) -> tuple[Action, str]:
        """
        Every frame: trigger async LLM check, return best available action.

        Returns:
            (action, reasoning_text) — reasoning shown in dashboard agent cam.
        """
        if observation.finished:
            return Action(accelerate=False), "race finished"

        # Trigger LLM call if interval elapsed (non-blocking)
        self._maybe_call_llm_async(observation)

        # Use latest LLM action if available, else reflex
        with self._llm_lock:
            if self._last_llm_action is not None:
                action = self._last_llm_action
                reasoning = self._last_reasoning
            else:
                action, _ = self.reflex.act(observation)
                reasoning = "reflex (awaiting LLM)"

        return action, reasoning

    def get_metadata(self) -> AgentMetadata:
        return AgentMetadata(
            name=self.name,
            model=self.model,
            owner_wallet=self.owner_wallet or "0x" + "0" * 40,
            agent_wallet=self.agent_wallet or "0x" + "0" * 40,
        )

    def reset(self) -> None:
        self.reflex.reset()
        self._last_llm_time = 0.0
        self._last_llm_action = None
        self._last_reasoning = ""
