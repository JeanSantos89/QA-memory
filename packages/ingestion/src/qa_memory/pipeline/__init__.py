"""Ingestion pipeline: chunking, two-pass extraction, embeddings."""

from __future__ import annotations

from qa_memory.pipeline.chunker import Chunk, chunk_text
from qa_memory.pipeline.embeddings import (
    DEFAULT_MODEL,
    EMBEDDING_DIM,
    EmbeddingModel,
    LocalEmbeddingModel,
    pack_vector,
    unpack_vector,
)
from qa_memory.pipeline.extractor import (
    ChunkSummary,
    ExtractedBehavior,
    ExtractionResult,
    TokenUsage,
    TwoPassExtractor,
)
from qa_memory.pipeline.llm import HAIKU_MODEL, AnthropicClient, LLMClient, LLMResponse

__all__ = [
    "DEFAULT_MODEL",
    "EMBEDDING_DIM",
    "HAIKU_MODEL",
    "AnthropicClient",
    "Chunk",
    "ChunkSummary",
    "EmbeddingModel",
    "ExtractedBehavior",
    "ExtractionResult",
    "LLMClient",
    "LLMResponse",
    "LocalEmbeddingModel",
    "TokenUsage",
    "TwoPassExtractor",
    "chunk_text",
    "pack_vector",
    "unpack_vector",
]
