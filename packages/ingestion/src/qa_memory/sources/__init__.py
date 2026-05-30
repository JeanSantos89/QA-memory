"""Source extractors: turn external docs into normalized text + metadata."""

from __future__ import annotations

from qa_memory.sources.base import ExtractedDoc, Source
from qa_memory.sources.pdf import PdfSource

__all__ = ["ExtractedDoc", "PdfSource", "Source"]
