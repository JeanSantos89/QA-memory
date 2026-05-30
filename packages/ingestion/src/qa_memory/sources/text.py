"""Text source — ingest raw text already in hand (agent-fed content, pasted
notes, fetched pages). No file parsing, no auth: the simplest source, and the
backbone of the agent-fed ingestion model (ADR 014)."""

from __future__ import annotations

from typing import ClassVar

from qa_memory.sources.base import ExtractedDoc, Source, sha256_hex


class TextSource(Source):
    type: ClassVar[str] = "conversation"

    def __init__(
        self,
        text: str,
        label: str,
        source_ref: str | None = None,
        source_type: str | None = None,
    ) -> None:
        self.text = text
        self.label = label
        self.source_ref = source_ref or label
        # Caller may tag where the text came from (e.g. confluence) for the
        # `sources.type` column; defaults to "conversation".
        self.source_type = source_type or self.type

    def extract(self) -> ExtractedDoc:
        text = self.text.strip()
        return ExtractedDoc(
            source_type=self.source_type,
            label=self.label,
            source_ref=self.source_ref,
            text=text,
            checksum=sha256_hex(text.encode("utf-8")),
        )
