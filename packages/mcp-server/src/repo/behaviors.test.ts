import { describe, expect, it } from "vitest";
import { openDb } from "../db/index.js";
import {
  countBehaviors,
  insertBehavior,
  listBehaviors,
  queryBehavior,
} from "./behaviors.js";

function seed() {
  const db = openDb(":memory:");
  insertBehavior(db, {
    name: "Login auth",
    description: "User can authenticate with email and password",
    criticality: "P0",
    confirmed_by_qa: true,
    source_ids: ["s1"],
  });
  insertBehavior(db, {
    name: "Password reset",
    description: "User resets password via email link",
    criticality: "P1",
  });
  insertBehavior(db, {
    name: "Old export",
    description: "Legacy CSV export",
    criticality: "P2",
    status: "deprecated",
  });
  return db;
}

describe("behaviors repo", () => {
  it("inserts and counts", () => {
    const db = seed();
    expect(countBehaviors(db)).toBe(3);
  });

  it("hydrates JSON + boolean fields", () => {
    const db = seed();
    const b = listBehaviors(db).find((x) => x.name === "Login auth")!;
    expect(b.source_ids).toEqual(["s1"]);
    expect(b.confirmed_by_qa).toBe(true);
    expect(b.status).toBe("active");
  });

  it("listBehaviors hides deprecated by default", () => {
    const db = seed();
    expect(listBehaviors(db).map((b) => b.name)).not.toContain("Old export");
    expect(
      listBehaviors(db, { includeDeprecated: true }).map((b) => b.name),
    ).toContain("Old export");
  });

  it("queryBehavior matches name or description, case-insensitive", () => {
    const db = seed();
    expect(queryBehavior(db, "reset").map((b) => b.name)).toEqual([
      "Password reset",
    ]);
    expect(queryBehavior(db, "AUTHENTICATE").map((b) => b.name)).toEqual([
      "Login auth",
    ]);
  });

  it("queryBehavior excludes deprecated and empty query returns all active", () => {
    const db = seed();
    expect(queryBehavior(db, "export")).toEqual([]);
    expect(queryBehavior(db, "  ").length).toBe(2);
  });
});
