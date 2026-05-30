"""Local embeddings — all-MiniLM-L6-v2 via sentence-transformers, no API.

Vectors serialize to a compact float32 BLOB (stdlib `array`, no numpy at the
storage boundary) for the `embeddings.vector` column. The model itself is
behind a Protocol so unit tests run without downloading torch/the model.
"""

from __future__ import annotations

from array import array
from typing import Protocol

# Local model: 384-dim, no API key, runs on CPU (CLAUDE.md embeddings strategy).
DEFAULT_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

_FLOAT32 = "f"


def pack_vector(vector: list[float]) -> bytes:
    """Serialize a float vector to a float32 BLOB (little-endian-normalized)."""
    arr = array(_FLOAT32, vector)
    return arr.tobytes()


def unpack_vector(blob: bytes) -> list[float]:
    """Inverse of pack_vector."""
    arr = array(_FLOAT32)
    arr.frombytes(blob)
    return [float(x) for x in arr]


class EmbeddingModel(Protocol):
    name: str

    def encode(self, texts: list[str]) -> list[list[float]]: ...


class LocalEmbeddingModel:
    """sentence-transformers wrapper. Lazy import → no torch dep at module load."""

    def __init__(self, name: str = DEFAULT_MODEL) -> None:
        self.name = name
        self._model: object | None = None

    def _ensure_model(self) -> object:
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.name)
        return self._model

    def encode(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure_model()
        vectors = model.encode(texts, convert_to_numpy=True)  # type: ignore[attr-defined]
        return [[float(x) for x in row] for row in vectors]
