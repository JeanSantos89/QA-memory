import { describe, expect, it } from "vitest";
import { openDb } from "../db/index.js";
import { insertBehavior } from "./behaviors.js";
import {
  findDuplicateRules,
  insertRule,
  listRulesForBehaviors,
  listUnconfirmedRules,
  normalizeRuleText,
  overrideRule,
  retireRule,
} from "./rules.js";

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

  describe("listUnconfirmedRules (curation queue)", () => {
    it("surfaces inferred + under_review rules, weakest first, with behavior context", () => {
      const { db } = seed();
      const pending = listUnconfirmedRules(db);
      // "QA rule" (qa_override) excluded; under_review 0.3 included, weakest first.
      expect(pending.map((p) => p.rule.rule_text)).toEqual(["Under review", "Inferred ok"]);
      expect(pending[0]?.rule.confidence).toBe(0.3);
      expect(pending[0]?.under_review).toBe(true);
      expect(pending[1]?.under_review).toBe(false);
      expect(pending[0]?.behavior_name).toBe("Auth");
      expect(pending[0]?.behavior_criticality).toBe("P0");
    });

    it("excludes rules under deprecated behaviors", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, {
        name: "Old",
        description: "gone",
        criticality: "P2",
        status: "deprecated",
      });
      insertRule(db, { behavior_id: bid, rule_text: "stale inference", confidence: 0.6 });
      expect(listUnconfirmedRules(db)).toEqual([]);
    });

    it("is empty when every rule is QA-confirmed", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, { name: "B", description: "d", criticality: "P1" });
      insertRule(db, { behavior_id: bid, rule_text: "pinned", confidence: 1.0, qa_override: true });
      expect(listUnconfirmedRules(db)).toEqual([]);
    });
  });

  describe("findDuplicateRules (dedup signal)", () => {
    it("normalizeRuleText lowercases, strips punctuation, collapses, keeps accents", () => {
      expect(normalizeRuleText("  One COUPON, per order! ")).toBe("one coupon per order");
      expect(normalizeRuleText("Cancelamento até 5min")).toBe("cancelamento até 5min");
    });

    it("clusters exact + near-duplicate rules, ignoring punctuation/case", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, { name: "Coupon", description: "d", criticality: "P1" });
      insertRule(db, { behavior_id: bid, rule_text: "One coupon per order" });
      insertRule(db, { behavior_id: bid, rule_text: "one coupon, per order!" }); // exact after normalize
      insertRule(db, { behavior_id: bid, rule_text: "Free shipping over 100" }); // unrelated
      const clusters = findDuplicateRules(db);
      expect(clusters).toHaveLength(1);
      expect(clusters[0]).toHaveLength(2);
      expect(clusters[0]!.map((d) => d.rule.rule_text).sort()).toEqual([
        "One coupon per order",
        "one coupon, per order!",
      ]);
    });

    it("clusters duplicates across different behaviors and carries behavior names", () => {
      const db = openDb(":memory:");
      const b1 = insertBehavior(db, { name: "Checkout", description: "d", criticality: "P1" });
      const b2 = insertBehavior(db, { name: "Cart", description: "d", criticality: "P2" });
      insertRule(db, { behavior_id: b1, rule_text: "Cart locks during payment" });
      insertRule(db, { behavior_id: b2, rule_text: "The cart locks during payment" });
      const clusters = findDuplicateRules(db);
      expect(clusters).toHaveLength(1);
      expect(clusters[0]!.map((d) => d.behavior_name).sort()).toEqual(["Cart", "Checkout"]);
    });

    it("respects the threshold: partial overlap clusters only when loose enough", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, { name: "B", description: "d", criticality: "P2" });
      // Share "password reset link" (3 tokens) → Jaccard ≈ 0.30.
      insertRule(db, { behavior_id: bid, rule_text: "Password reset link expires in 15 minutes" });
      insertRule(db, { behavior_id: bid, rule_text: "Password reset link is single use" });
      expect(findDuplicateRules(db)).toEqual([]); // default 0.7 → too strict to cluster
      expect(findDuplicateRules(db, 0.2).length).toBeGreaterThan(0); // loose → clusters
    });

    it("returns no cluster for rules with no shared words", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, { name: "B", description: "d", criticality: "P2" });
      insertRule(db, { behavior_id: bid, rule_text: "Password reset link expires in fifteen minutes" });
      insertRule(db, { behavior_id: bid, rule_text: "Account locks after three failed logins" });
      expect(findDuplicateRules(db)).toEqual([]);
    });

    it("excludes rules under deprecated behaviors", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, { name: "Old", description: "d", criticality: "P3", status: "deprecated" });
      insertRule(db, { behavior_id: bid, rule_text: "same text here" });
      insertRule(db, { behavior_id: bid, rule_text: "same text here" });
      expect(findDuplicateRules(db)).toEqual([]);
    });
  });

  describe("retireRule (supersede, migration 002)", () => {
    it("new rules default to status 'active'", () => {
      const { db, bid } = seed();
      const r = listRulesForBehaviors(db, [bid])[0];
      expect(r?.status).toBe("active");
    });

    it("retires a rule: superseded, hidden from every read, reason kept", () => {
      const { db, bid } = seed();
      const target = listUnconfirmedRules(db).find((p) => p.rule.rule_text === "Inferred ok")!;
      const r = retireRule(db, target.rule.id, "duplicate of QA rule");
      expect(r?.status).toBe("superseded");
      expect(r?.override_reason).toBe("duplicate of QA rule");
      // gone from visible rules + the curation queue.
      expect(listRulesForBehaviors(db, [bid]).map((x) => x.rule_text)).not.toContain("Inferred ok");
      expect(listUnconfirmedRules(db).map((p) => p.rule.rule_text)).not.toContain("Inferred ok");
    });

    it("returns null for an unknown id", () => {
      const { db } = seed();
      expect(retireRule(db, "nope", "x")).toBeNull();
    });

    it("a retired duplicate drops out of findDuplicateRules", () => {
      const db = openDb(":memory:");
      const bid = insertBehavior(db, { name: "Coupon", description: "d", criticality: "P1" });
      const id1 = insertRule(db, { behavior_id: bid, rule_text: "One coupon per order" });
      insertRule(db, { behavior_id: bid, rule_text: "one coupon, per order!" });
      expect(findDuplicateRules(db)).toHaveLength(1);
      retireRule(db, id1, "duplicate");
      expect(findDuplicateRules(db)).toEqual([]); // only one active rule remains
    });
  });
});
