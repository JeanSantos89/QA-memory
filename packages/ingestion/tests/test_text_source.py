from qa_memory.sources.base import ExtractedDoc, sha256_hex
from qa_memory.sources.text import TextSource


def test_extracts_trimmed_text_and_defaults() -> None:
    doc = TextSource("  login locks after 3 fails  ", label="note").extract()

    assert isinstance(doc, ExtractedDoc)
    assert doc.text == "login locks after 3 fails"  # trimmed
    assert doc.source_type == "conversation"  # default tag
    assert doc.label == "note"
    assert doc.source_ref == "note"  # falls back to label


def test_checksum_is_sha256_of_trimmed_text() -> None:
    doc = TextSource("hello", label="x").extract()
    assert doc.checksum == sha256_hex(b"hello")


def test_source_type_and_ref_are_overridable() -> None:
    doc = TextSource(
        "page body", label="Checkout page", source_ref="CONF-123", source_type="confluence"
    ).extract()
    assert doc.source_type == "confluence"
    assert doc.source_ref == "CONF-123"
