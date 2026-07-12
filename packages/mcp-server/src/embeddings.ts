// Vector math for semantic search. Mirrors the Python storage format:
// vectors are float32 little-endian BLOBs (Python `array('f').tobytes()`).
// Pure functions — no model, no I/O — so ranking is unit-testable on its own.

// The one embedding model whose vectors are comparable. Stored on every
// embeddings row and filtered on at query time: vectors from a different model
// (even same-dimension) must never enter the same cosine ranking.
export const EMBED_MODEL = "all-MiniLM-L6-v2";

// Deserialize a float32 BLOB (as stored by the ingestion pipeline) to numbers.
export function unpackVector(blob: Buffer): number[] {
  // A Float32Array view over the buffer's bytes. Node is little-endian on all
  // supported platforms, matching Python's array('f') on the same machine.
  const view = new Float32Array(
    blob.buffer,
    blob.byteOffset,
    Math.floor(blob.byteLength / 4),
  );
  return Array.from(view);
}

// Cosine similarity in [-1, 1]. Returns 0 if either vector is zero/empty or
// lengths mismatch (defensive — never throws on bad stored data).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
