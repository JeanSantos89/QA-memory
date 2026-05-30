"""PDF source — extract text via pymupdf (fitz). No auth, simplest first source."""

from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from qa_memory.sources.base import ExtractedDoc, Source, sha256_hex


class PdfSource(Source):
    type: ClassVar[str] = "pdf"

    def __init__(self, path: str | Path, label: str | None = None) -> None:
        self.path = Path(path)
        self.label = label or self.path.name

    def extract(self) -> ExtractedDoc:
        import fitz  # pymupdf; imported lazily so non-PDF code paths stay light

        raw = self.path.read_bytes()
        parts: list[str] = []
        with fitz.open(stream=raw, filetype="pdf") as doc:
            for page in doc:
                parts.append(page.get_text("text"))
        text = "\n".join(parts).strip()
        return ExtractedDoc(
            source_type=self.type,
            label=self.label,
            source_ref=str(self.path),
            text=text,
            checksum=sha256_hex(raw),
        )
