import math

import pytest

from qa_memory.pipeline.embeddings import (
    EMBEDDING_DIM,
    pack_vector,
    unpack_vector,
)


class FakeModel:
    name = "fake"

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def encode(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[float(len(t)), 0.5, -1.0] for t in texts]


def test_pack_unpack_roundtrip() -> None:
    vec = [0.1, -2.5, 3.14159, 0.0, 100.0]
    out = unpack_vector(pack_vector(vec))
    assert len(out) == len(vec)
    for a, b in zip(vec, out, strict=True):
        assert math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6)


def test_pack_is_float32_4_bytes_each() -> None:
    assert len(pack_vector([1.0, 2.0, 3.0])) == 12


def test_empty_vector() -> None:
    assert pack_vector([]) == b""
    assert unpack_vector(b"") == []


def test_dim_constant_matches_minilm() -> None:
    assert EMBEDDING_DIM == 384


def test_model_protocol_encode() -> None:
    model = FakeModel()
    out = model.encode(["ab", "abcd"])
    assert out == [[2.0, 0.5, -1.0], [4.0, 0.5, -1.0]]
    assert model.calls == [["ab", "abcd"]]


def test_local_model_empty_input_skips_load() -> None:
    # Empty input must NOT trigger the lazy sentence-transformers import.
    from qa_memory.pipeline.embeddings import LocalEmbeddingModel

    assert LocalEmbeddingModel().encode([]) == []


def test_roundtrip_negative_and_small() -> None:
    vec = [-0.000123, 9999.5]
    out = unpack_vector(pack_vector(vec))
    assert math.isclose(out[1], 9999.5, rel_tol=1e-4)


@pytest.mark.parametrize("n", [0, 1, 3, 384])
def test_roundtrip_various_lengths(n: int) -> None:
    vec = [float(i) for i in range(n)]
    assert unpack_vector(pack_vector(vec)) == vec
