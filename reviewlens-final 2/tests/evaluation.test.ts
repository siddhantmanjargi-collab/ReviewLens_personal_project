import { describe, expect, it } from "vitest";
import { classifyRisk, heuristicSignals, type ReviewLike } from "@/lib/detector";
import samples from "../data/synthetic-review-samples.json";

/**
 * Regression check for the text/pattern part of the detector (no Gemini involved).
 *
 * IMPORTANT: the sample reviews are synthetic and were written by the same author as the rules,
 * so passing here proves the detector behaves as designed. It does NOT measure accuracy on real
 * reviews. Real accuracy needs labelled real reviews and is still to be measured.
 */
type Sample = { id: string; category: string; rating: number; text: string; label: "genuine_pattern" | "suspicious_pattern" };
const all = samples.reviews as Sample[];
const like = (s: Sample): ReviewLike => ({ id: s.id, text: s.text, rating: s.rating });

function scoreWithinCategory(s: Sample) {
  const siblings = all.filter((o) => o.category === s.category).map(like);
  return heuristicSignals(like(s), siblings).risk;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("synthetic sample file", () => {
  it("is clearly marked synthetic and well formed", () => {
    expect(samples.synthetic).toBe(true);
    expect(samples._readme).toMatch(/SYNTHETIC/);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(all.filter((s) => s.label === "genuine_pattern").length).toBeGreaterThanOrEqual(20);
    expect(all.filter((s) => s.label === "suspicious_pattern").length).toBeGreaterThanOrEqual(20);
  });
});

describe("heuristic detector on the synthetic samples", () => {
  const genuine = all.filter((s) => s.label === "genuine_pattern");
  const suspicious = all.filter((s) => s.label === "suspicious_pattern");
  const g = genuine.map(scoreWithinCategory);
  const sus = suspicious.map(scoreWithinCategory);

  it("scores suspicious-pattern reviews clearly higher than genuine-pattern reviews on average", () => {
    expect(mean(sus)).toBeGreaterThan(mean(g) + 0.15);
  });
  it("keeps every genuine-pattern review below the moderate-risk threshold on text signals alone", () => {
    expect(g.filter((r) => classifyRisk(r) !== "low_suspicion")).toHaveLength(0);
  });
  it("ranks every suspicious-pattern sample above every genuine-pattern sample", () => {
    expect(Math.min(...sus)).toBeGreaterThan(Math.max(...g));
  });
  it("documents a known limit: text signals alone are cautious and do not push most samples past 'moderate'", () => {
    // The final classification relies on Gemini's judgement as well. If this ever changes, update the README.
    const flagged = sus.filter((r) => classifyRisk(r) !== "low_suspicion").length;
    expect(flagged / sus.length).toBeLessThan(0.9);
  });
});
