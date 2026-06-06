import { describe, expect, it } from "vitest";
import { openDb } from "../db/index.js";
import {
  countBehaviors,
  deprecateBehavior,
  findDuplicateBehaviors,
  insertBehavior,
  listBehaviors,
  normalizeBehaviorText,
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

describe("findDuplicateBehaviors", () => {
  it("normalizeBehaviorText lowercases and strips non-alphanumeric", () => {
    expect(normalizeBehaviorText("Login Auth!")).toBe("login auth");
    expect(normalizeBehaviorText("Cancelamento — grátis")).toBe("cancelamento grátis");
  });

  it("finds exact-name duplicates in same description cluster", () => {
    const db = openDb(":memory:");
    insertBehavior(db, { name: "Login auth", description: "User authenticates", criticality: "P1" });
    insertBehavior(db, { name: "Login auth", description: "User authenticates via email", criticality: "P1" });
    insertBehavior(db, { name: "Password reset", description: "Sends reset email", criticality: "P2" });
    const clusters = findDuplicateBehaviors(db, 0.5);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
    expect(clusters[0]!.map((d) => d.behavior.name)).toEqual(["Login auth", "Login auth"]);
  });

  it("clusters near-duplicate behaviors above threshold", () => {
    const db = openDb(":memory:");
    insertBehavior(db, { name: "Order cancellation", description: "User can cancel a pending order before shipping", criticality: "P1" });
    insertBehavior(db, { name: "Order cancellation flow", description: "User can cancel a pending order before it ships", criticality: "P1" });
    insertBehavior(db, { name: "Payment checkout", description: "User pays with credit card at checkout", criticality: "P0" });
    const clusters = findDuplicateBehaviors(db, 0.4);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    const names = clusters.flatMap((g) => g.map((d) => d.behavior.name));
    expect(names).toContain("Order cancellation");
    expect(names).toContain("Order cancellation flow");
  });

  it("excludes deprecated behaviors from dedup scan", () => {
    const db = openDb(":memory:");
    insertBehavior(db, { name: "Login", description: "User signs in with email", criticality: "P1" });
    insertBehavior(db, { name: "Login", description: "User signs in with email", criticality: "P1", status: "deprecated" });
    const clusters = findDuplicateBehaviors(db);
    expect(clusters).toHaveLength(0);
  });

  it("returns empty when no duplicates exist", () => {
    const db = openDb(":memory:");
    insertBehavior(db, { name: "Login", description: "User authenticates", criticality: "P1" });
    insertBehavior(db, { name: "Checkout", description: "User pays for items", criticality: "P0" });
    expect(findDuplicateBehaviors(db)).toHaveLength(0);
  });
});

describe("deprecateBehavior", () => {
  it("sets status to deprecated and records reason in qa_note", () => {
    const db = openDb(":memory:");
    const id = insertBehavior(db, { name: "Old Login", description: "Legacy login flow", criticality: "P2" });
    const result = deprecateBehavior(db, id, "duplicate of new Login behavior");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("deprecated");
    expect(result!.qa_note).toBe("duplicate of new Login behavior");
  });

  it("deprecated behavior disappears from listBehaviors and findDuplicateBehaviors", () => {
    const db = openDb(":memory:");
    const id1 = insertBehavior(db, { name: "Login", description: "User authenticates via email", criticality: "P1" });
    insertBehavior(db, { name: "Login", description: "User authenticates via email", criticality: "P1" });
    expect(findDuplicateBehaviors(db)).toHaveLength(1); // cluster exists
    deprecateBehavior(db, id1, "duplicate");
    expect(findDuplicateBehaviors(db)).toHaveLength(0); // cluster gone
    expect(listBehaviors(db).find((b) => b.id === id1)).toBeUndefined();
  });

  it("returns null for unknown id", () => {
    const db = openDb(":memory:");
    expect(deprecateBehavior(db, "no-such-id", "reason")).toBeNull();
  });
});
