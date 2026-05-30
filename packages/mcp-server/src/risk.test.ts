import { describe, expect, it } from "vitest";
import type { Behavior } from "./repo/behaviors.js";
import type { Rule } from "./repo/rules.js";
import { computeRisk } from "./risk.js";

function behavior(over: Partial<Behavior>): Behavior {
  return {
    id: "b1",
    name: "B",
    description: "",
    criticality: "P2",
    status: "active",
    source_ids: [],
    confirmed_by_qa: true,
    qa_note: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function rule(over: Partial<Rule>): Rule {
  return {
    id: "r1",
    behavior_id: "b1",
    rule_text: "",
    confidence: 1.0,
    source_excerpt: null,
    source_id: null,
    qa_override: true,
    override_reason: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("computeRisk", () => {
  it("returns unknown when no behavior matches (no coverage)", () => {
    const r = computeRisk([], []);
    expect(r.level).toBe("unknown");
    expect(r.score).toBe(0);
  });

  it("P0 confirmed behavior with a QA rule scores high but with no uncertainty bonus", () => {
    const b = behavior({ id: "b1", criticality: "P0", confirmed_by_qa: true });
    const r = computeRisk([b], [rule({ behavior_id: "b1", qa_override: true })]);
    expect(r.score).toBe(1.0);
    expect(r.level).toBe("high");
    expect(r.reasons.some((x) => x.includes("knowledge gap"))).toBe(false);
  });

  it("compounds uncertainty: unconfirmed P2 with no rules outranks its base criticality", () => {
    const b = behavior({ id: "b1", criticality: "P2", confirmed_by_qa: false });
    const r = computeRisk([b], []); // base 0.4 + 0.1 unconfirmed + 0.1 no rules
    expect(r.score).toBeCloseTo(0.6, 5);
    expect(r.level).toBe("medium");
  });

  it("flags all-inferred low-confidence rules as a risk driver", () => {
    const b = behavior({ id: "b1", criticality: "P3", confirmed_by_qa: true });
    const r = computeRisk([b], [rule({ qa_override: false, confidence: 0.6 })]);
    expect(r.reasons.some((x) => x.includes("low-confidence"))).toBe(true);
  });
});
