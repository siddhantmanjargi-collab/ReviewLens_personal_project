import { describe, expect, it } from "vitest";
import { classifyRisk, combineRisk, heuristicSignals, ratingMismatch, THRESHOLDS } from "@/lib/detector";

const r = (id: string, text: string, rating = 4, extra: object = {}) => ({ id, text, rating, ...extra });

const GENUINE = "Battery lasts about 2 days with moderate use. The camera is decent in daylight but noisy at night. Bought it 3 weeks ago for 15999 and the 120Hz display is smooth, though the charger heats up.";

describe("heuristicSignals", () => {
  it("scores a detailed, specific review as low risk", () => {
    expect(heuristicSignals(r("a", GENUINE), []).risk).toBeLessThan(0.15);
  });
  it("flags very short generic praise as moderately risky, but never near the maximum, on text alone", () => {
    const h = heuristicSignals(r("a", "Good product"), []);
    expect(h.risk).toBeGreaterThan(0.25);
    expect(h.risk).toBeLessThan(0.65);
    // with no other reviews to compare, the duplicate and timing checks are marked as not judged
    expect(h.signals.filter((s) => !s.applicable).map((s) => s.name).sort()).toEqual(["near_duplicate_reviews", "review_burst"]);
    expect(h.signals.find((s) => s.name === "generic_language")!.strength).toBe(1);
  });
  it("flags promotional text with contact details", () => {
    const h = heuristicSignals(r("a", "Highly recommend!!! Must buy!!! Contact on whatsapp 9876543210 for discount"), []);
    expect(h.signals.find((s) => s.name === "promotional_language")!.strength).toBe(1);
  });
  it("flags near-duplicate reviews of the same product", () => {
    const text = "Excellent phone with great camera and long battery life, totally worth buying for everyone";
    const siblings = [r("b", text), r("c", text + " today")];
    const h = heuristicSignals(r("a", text), siblings);
    expect(h.signals.find((s) => s.name === "near_duplicate_reviews")!.strength).toBeGreaterThan(0.8);
  });
  it("does not compare a review with itself", () => {
    const me = r("a", GENUINE);
    expect(heuristicSignals(me, [me]).signals.find((s) => s.name === "near_duplicate_reviews")!.strength).toBe(0);
  });
  it("flags a same-day burst only when enough dated reviews exist", () => {
    const burstDay = Array.from({ length: 8 }, (_, i) => r(`s${i}`, `Review number ${i} about this product with different words ${i * 7}`, 5, { date: "2026-03-01" }));
    const me = r("me", "Another one posted that same day", 5, { date: "2026-03-01" });
    expect(heuristicSignals(me, burstDay).signals.find((s) => s.name === "review_burst")!.strength).toBeGreaterThan(0.5);
    expect(heuristicSignals(me, burstDay.slice(0, 3)).signals.find((s) => s.name === "review_burst")!.strength).toBe(0);
  });
  it("always stays inside 0..1", () => {
    const h = heuristicSignals(r("a", "BUY NOW!!! BUY NOW!!! BUY NOW!!! www.spam.com"), [r("b", "BUY NOW!!! BUY NOW!!! BUY NOW!!! www.spam.com")]);
    expect(h.risk).toBeGreaterThanOrEqual(0);
    expect(h.risk).toBeLessThanOrEqual(1);
  });
});

describe("ratingMismatch", () => {
  it("is 0 when stars and text agree, high when they are opposite", () => {
    expect(ratingMismatch(5, "positive", 0.9)).toBe(0);
    expect(ratingMismatch(5, "negative", 0.9)).toBeCloseTo(0.9);
    expect(ratingMismatch(1, "positive", 0.8)).toBeCloseTo(0.8);
    expect(ratingMismatch(3, "positive", 0.5)).toBeCloseTo(0.2);
  });
});

describe("classification and combination", () => {
  it("uses the documented thresholds", () => {
    expect(classifyRisk(0)).toBe("low_suspicion");
    expect(classifyRisk(THRESHOLDS.moderate - 0.001)).toBe("low_suspicion");
    expect(classifyRisk(THRESHOLDS.moderate)).toBe("moderate_suspicion");
    expect(classifyRisk(THRESHOLDS.high)).toBe("highly_suspicious");
    expect(classifyRisk(1)).toBe("highly_suspicious");
  });
  it("keeps the combined risk within 0..1 and records the breakdown", () => {
    const c = combineRisk({ heuristicRisk: 1, geminiRisk: 1, ratingMismatch: 1, signals: [] });
    expect(c.risk).toBe(1);
    expect(c.classification).toBe("highly_suspicious");
    expect(c.breakdown.weights.heuristic + c.breakdown.weights.gemini + c.breakdown.weights.mismatch).toBeCloseTo(1);
    expect(combineRisk({ heuristicRisk: 0, geminiRisk: 0, ratingMismatch: 0, signals: [] }).risk).toBe(0);
  });
  it("one high component alone does not reach 'highly suspicious'", () => {
    expect(combineRisk({ heuristicRisk: 0, geminiRisk: 1, ratingMismatch: 0, signals: [] }).classification).not.toBe("highly_suspicious");
  });
});
