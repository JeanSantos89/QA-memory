"""LLM client abstraction. Real impl wraps anthropic; tests inject a fake.

Every call returns token counts — CLAUDE.md: every LLM call logs tokens (in+out).
Keeping the client behind a Protocol means the extractor never imports anthropic
directly, so unit tests run with zero network + zero API key.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

# Cheapest model for batch extraction (CLAUDE.md token strategy).
HAIKU_MODEL = "claude-haiku-4-5-20251001"


@dataclass(frozen=True)
class LLMResponse:
    text: str
    input_tokens: int
    output_tokens: int


class LLMClient(Protocol):
    def complete(self, system: str, user: str, max_tokens: int) -> LLMResponse: ...


class AnthropicClient:
    """Thin wrapper over the anthropic SDK. Lazy import → no dep at module load."""

    def __init__(self, model: str = HAIKU_MODEL, api_key: str | None = None) -> None:
        self.model = model
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._client: object | None = None

    def _ensure_client(self) -> object:
        if self._client is None:
            from anthropic import Anthropic

            self._client = Anthropic(api_key=self._api_key)
        return self._client

    def complete(self, system: str, user: str, max_tokens: int) -> LLMResponse:
        client = self._ensure_client()
        resp = client.messages.create(  # type: ignore[attr-defined]
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(
            block.text for block in resp.content if getattr(block, "type", None) == "text"
        )
        return LLMResponse(
            text=text,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
        )
