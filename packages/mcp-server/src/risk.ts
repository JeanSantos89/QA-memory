// Risk scoring — pure, transparent, testable. No DB access here.
// Score is DERIVED from two ingredients we already store:
//   1. base = worst criticality among the matched behaviors (P0 = highest stake)
//   2. uncertainty modifiers = how shaky our knowledge of those behaviors is
// Every contribution is echoed in `reasons` so the agent can see WHY, not just a number.
import type { Behavior } from "./repo/behaviors.js";
import type { Rule } from "./repo/rules.js";

// Confidence we want before treating an inferred rule as solid knowledge.
const CONFIRMED_RULE_CONFIDENCE = 0.7;

export type RiskLevel = "high" | "medium" | "low" | "unknown";

export interface RiskAssessment {
  score: number; // 0..1
  level: RiskLevel;
  reasons: string[];
}

const CRITICALITY_WEIGHT: Record<string, number> = {
  P0: 1.0,
  P1: 0.7,
  P2: 0.4,
  P3: 0.2,
};

function criticalityWeight(c: string): number {
  return CRITICALITY_WEIGHT[c] ?? 0.5; // custom/unknown → middle stake
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function levelFor(score: number): RiskLevel {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

// behaviors = matched behaviors; rules = visible rules across those behaviors.
export function computeRisk(behaviors: Behavior[], rules: Rule[]): RiskAssessment {
  if (behaviors.length === 0) {
    return {
      score: 0,
      level: "unknown",
      reasons: ["No known behavior matches this area — qa-memory has no coverage here."],
    };
  }

  const reasons: string[] = [];

  // Base: the worst criticality at stake drives the floor.
  const worst = behaviors.reduce((acc, b) =>
    criticalityWeight(b.criticality) > criticalityWeight(acc.criticality) ? b : acc,
  );
  const base = criticalityWeight(worst.criticality);
  reasons.push(`Highest criticality at stake: ${worst.criticality} (${worst.name}).`);

  // Uncertainty modifiers — each compounds risk because we may be missing rules.
  let bonus = 0;

  const unconfirmed = behaviors.filter((b) => !b.confirmed_by_qa);
  if (unconfirmed.length > 0) {
    bonus += 0.1;
    reasons.push(`${unconfirmed.length} matched behavior(s) not yet confirmed by QA.`);
  }

  const rulesByBehavior = new Map<string, Rule[]>();
  for (const r of rules) {
    const list = rulesByBehavior.get(r.behavior_id) ?? [];
    list.push(r);
    rulesByBehavior.set(r.behavior_id, list);
  }

  const noRules = behaviors.filter((b) => !rulesByBehavior.has(b.id));
  if (noRules.length > 0) {
    bonus += 0.1;
    reasons.push(`${noRules.length} matched behavior(s) have no known rules (knowledge gap).`);
  }

  const allInferred =
    rules.length > 0 &&
    rules.every((r) => !r.qa_override && r.confidence < CONFIRMED_RULE_CONFIDENCE);
  if (allInferred) {
    bonus += 0.1;
    reasons.push("All known rules are low-confidence inferences (none QA-confirmed).");
  }

  const score = clamp01(base + bonus);
  return { score: Math.round(score * 100) / 100, level: levelFor(score), reasons };
}
