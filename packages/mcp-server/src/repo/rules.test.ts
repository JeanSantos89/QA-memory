import { describe, expect, it } from "vitest";
import { openDb } from "../db/index.js";
import { insertBehavior } from "./behaviors.js";
import { insertRule, listRulesForBehaviors, overrideRule } from "./rules.js";

function seed() {
  const db = openDb(":memory:");
  const bid = insertBehavior(db, { name: "Auth", description: "login", criticality: "P0" });
  insertRule(db, { behavior_id: bid, rule_text: "QA rule", confidence: 1.0, qa_override: true });
  insertRule(db, { behavior_id: bid, rule_text: "Inferred ok", confidence: 0.6 });
  insertRule(db, { behavior_id: bid, rule_text: "Under review", confidence: 0.3 });
  return { db, bid };
}

describe("rules repo", () => {
  it("hides under_review rules (confidence < 0.5) and hydrates qa_override", () => {
    const { db, bid } = seed();
    const rules = listRulesForBehaviors(db, [bid]);
    expect(rules.map((r) => r.rule_text)).toEqual(["QA rule", "Inferred ok"]);
    expect(rules[0]?.qa_override).toBe(true);
    expect(rules[1]?.qa_override).toBe(false);
  });

  it("returns empty for no behavior ids", () => {
    const { db } = seed();
    expect(listRulesForBehaviors(db, [])).toEqual([]);
  });

  it("override pins a low-confidence rule to QA-confirmed and surfaces it", () => {
    const { db, bid } = seed();
    const underReview = insertRule(db, {
      behavior_id: bid,
      rule_text: "shaky",
      confidence: 0.3,
    });
    const updated = overrideRule(db, underReview, "now authoritative", "QA decided");
    expect(updated?.confidence).toBe(1.0);
    expect(updated?.qa_override).toBe(true);
    expect(updated?.override_reason).toBe("QA decided");
    // was hidden (0.3 < 0.5); now visible after override.
    expect(listRulesForBehaviors(db, [bid]).map((r) => r.rule_text)).toContain(
      "now authoritative",
    );
  });

  it("override returns null for an unknown id", () => {
    const { db } = seed();
    expect(overrideRule(db, "nope", "x", "y")).toBeNull();
  });
});
