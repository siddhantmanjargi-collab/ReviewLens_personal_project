import { describe, expect, it } from "vitest";
import { compareIdentity, titleSimilarity } from "@/lib/identity";

const claim = { asin: "B0FIXTURE1", productName: "Acme Nova X1 5G Smartphone 8GB 128GB", brand: "Acme", model: "Nova X1" };
const evidence = { asin: "B0FIXTURE1", title: "Acme Nova X1 5G (8GB RAM, 128GB Storage) Smartphone", brand: "Acme", model: "Nova X1" };

describe("compareIdentity", () => {
  it("verifies when ASIN, title, brand and model agree", () => {
    expect(compareIdentity(claim, evidence).verified).toBe(true);
  });
  it("rejects an ASIN mismatch (Product A info + Product B URL)", () => {
    const d = compareIdentity(claim, { ...evidence, asin: "B0FIXTURE2" });
    expect(d.verified).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/ASIN mismatch/);
  });
  it("rejects when evidence has no ASIN", () => {
    expect(compareIdentity(claim, { ...evidence, asin: null }).verified).toBe(false);
  });
  it("rejects when titles describe different products", () => {
    const d = compareIdentity(claim, { ...evidence, title: "Zenith Blender 750W Mixer Grinder" });
    expect(d.verified).toBe(false);
  });
  it("rejects a brand conflict", () => {
    expect(compareIdentity(claim, { ...evidence, brand: "Zenith" }).verified).toBe(false);
  });
  it("rejects a model that does not appear in the evidence", () => {
    expect(compareIdentity({ ...claim, model: "Nova X2" }, evidence).verified).toBe(false);
  });
  it("rejects when evidence has no title", () => {
    expect(compareIdentity(claim, { ...evidence, title: null }).verified).toBe(false);
  });
});

describe("titleSimilarity", () => {
  it("is 0 for empty input and 1 for identical text", () => {
    expect(titleSimilarity("", "x")).toBe(0);
    expect(titleSimilarity("Acme Nova X1", "acme nova x1")).toBe(1);
  });
});
