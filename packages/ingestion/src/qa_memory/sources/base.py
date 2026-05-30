"""Source abstraction. Each source type extracts to a normalized ExtractedDoc."""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import ClassVar


@dataclass(frozen=True)
class ExtractedDoc:
    """Normalized output of a source. Feeds the chunker → extractor → embeddings."""

    source_type: str  # matches `sources.type` in schema: pdf|google_doc|jira|...
    label: str
    source_ref: str  # path/URL/ID/query
    text: str
    checksum: str  # sha256 hex of raw bytes — skip reprocessing identical docs


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Source(ABC):
    """Base for every source extractor. Subclasses set `type` + implement extract()."""

    type: ClassVar[str]

    @abstractmethod
    def extract(self) -> ExtractedDoc:
        """Read the underlying doc and return normalized text + metadata."""
        raise NotImplementedError
