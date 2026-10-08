import { describe, expect, it } from "vitest";
import { buildCatalogSource } from "@/lib/catalog";

describe("approved catalog", () => {
  it("the shipped catalog is valid and empty (no invented products)", async () => {
    const src = buildCatalogSource();
    const ev = await src.retrieve("https://www.amazon.in/dp/B0FIXTURE1", "B0FIXTURE1");
    expect(ev.status).toBe("unavailable");
  });
  it("rejects malformed ASINs, duplicate ASINs and records without capturedAt", () => {
    const rec = { asin: "B0FIXTURE1", title: "t" };
    expect(() => buildCatalogSource({ capturedAt: "2026-01-01T00:00:00Z", records: [{ ...rec, asin: "bad" }] })).toThrow();
    expect(() => buildCatalogSource({ capturedAt: "2026-01-01T00:00:00Z", records: [rec, rec] })).toThrow(/Duplicate/);
    expect(() => buildCatalogSource({ capturedAt: null, records: [rec] })).toThrow(/capturedAt/);
  });
});
