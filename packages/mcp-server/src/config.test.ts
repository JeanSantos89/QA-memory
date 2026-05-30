import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DB_PATH, resolveDbPath } from "./config.js";

describe("resolveDbPath", () => {
  it("defaults to the instance dir path", () => {
    expect(resolveDbPath({})).toBe(resolve(DEFAULT_DB_PATH));
  });

  it("honors QA_MEMORY_DB override", () => {
    expect(resolveDbPath({ QA_MEMORY_DB: "/tmp/x.db" })).toBe(
      resolve("/tmp/x.db"),
    );
  });

  it("ignores blank override", () => {
    expect(resolveDbPath({ QA_MEMORY_DB: "   " })).toBe(
      resolve(DEFAULT_DB_PATH),
    );
  });
});
