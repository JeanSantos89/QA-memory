import { describe, expect, it } from "vitest";
import { cosineSimilarity, unpackVector } from "./embeddings.js";

// Mirrors Python pack_vector: array('f').tobytes().
function pack(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

describe("vector math", () => {
  it("unpackVector round-trips a float32 BLOB", () => {
    const out = unpackVector(pack([1, 0.5, -0.25, 0]));
    expect(out).toHaveLength(4);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(-0.25, 5);
  });

  it("cosineSimilarity: 1 for identical, ~0 for orthogonal", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("cosineSimilarity is defensive on bad input", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
