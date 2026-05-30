import pytest

from qa_memory.pipeline.chunker import Chunk, chunk_text


def test_empty_input_returns_empty() -> None:
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_short_text_single_chunk() -> None:
    chunks = chunk_text("hello world", max_chars=100, overlap=0)
    assert chunks == [Chunk(index=0, text="hello world")]


def test_packs_paragraphs_greedily() -> None:
    text = "aaa\n\nbbb\n\nccc"
    chunks = chunk_text(text, max_chars=10, overlap=0)
    # "aaa\n\nbbb" = 8 chars fits; adding ccc would exceed 10 → new chunk
    assert [c.text for c in chunks] == ["aaa\n\nbbb", "ccc"]


def test_indices_sequential() -> None:
    chunks = chunk_text("aaa\n\nbbb\n\nccc", max_chars=3, overlap=0)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_hard_split_oversized_paragraph_with_overlap() -> None:
    para = "x" * 25
    chunks = chunk_text(para, max_chars=10, overlap=2)
    # step = 8 → windows start at 0,8,16,24 → lengths 10,10,9,1
    assert [c.text for c in chunks] == ["x" * 10, "x" * 10, "x" * 9, "x"]


def test_every_chunk_within_max() -> None:
    text = "\n\n".join("para " + str(i) * 50 for i in range(10))
    for c in chunk_text(text, max_chars=120, overlap=20):
        assert len(c.text) <= 120


def test_invalid_params_raise() -> None:
    with pytest.raises(ValueError):
        chunk_text("x", max_chars=0)
    with pytest.raises(ValueError):
        chunk_text("x", max_chars=10, overlap=10)
