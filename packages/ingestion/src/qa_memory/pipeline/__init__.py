"""Ingestion pipeline: chunking, two-pass extraction, embeddings."""

from __future__ import annotations

from qa_memory.pipeline.chunker import Chunk, chunk_text

__all__ = ["Chunk", "chunk_text"]
