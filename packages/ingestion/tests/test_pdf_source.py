from pathlib import Path

import fitz  # pymupdf

from qa_memory.sources import ExtractedDoc, PdfSource
from qa_memory.sources.base import sha256_hex


def _make_pdf(path: Path, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    doc.save(str(path))
    doc.close()


def test_extracts_text_and_metadata(tmp_path: Path) -> None:
    pdf = tmp_path / "spec.pdf"
    _make_pdf(pdf, "Behavior: login must lock after 3 fails")

    doc = PdfSource(pdf).extract()

    assert isinstance(doc, ExtractedDoc)
    assert doc.source_type == "pdf"
    assert doc.label == "spec.pdf"
    assert doc.source_ref == str(pdf)
    assert "login must lock" in doc.text


def test_checksum_matches_raw_bytes(tmp_path: Path) -> None:
    pdf = tmp_path / "doc.pdf"
    _make_pdf(pdf, "content")
    doc = PdfSource(pdf).extract()
    assert doc.checksum == sha256_hex(pdf.read_bytes())


def test_custom_label(tmp_path: Path) -> None:
    pdf = tmp_path / "x.pdf"
    _make_pdf(pdf, "y")
    assert PdfSource(pdf, label="Custom").extract().label == "Custom"
