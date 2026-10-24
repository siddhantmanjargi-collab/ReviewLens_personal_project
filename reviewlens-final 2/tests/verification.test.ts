import { describe, expect, it } from "vitest";
import { verifyProductCandidate } from "@/lib/verification";
import { ASIN_B, claimA, datasetSource, fixedSource, liveEvidenceA, URL_B } from "./fixtures";

const now = () => new Date("2026-02-02T00:00:00.000Z");

describe("verifyProductCandidate", () => {
  it("marks URL + identity verified only for matching LIVE evidence with a canonical URL", async () => {
    const r = await verifyProductCandidate(claimA, fixedSource(liveEvidenceA), now);
    expect(r.identityVerified).toBe(true);
    expect(r.urlVerified).toBe(true);
    expect(r.urlStatus).toBe("verified");
    expect(r.canonicalUrl).toBe("https://www.amazon.in/dp/B0FIXTURE1");
  });

  it("does NOT mark URL verified when live evidence has no canonical URL", async () => {
    const r = await verifyProductCandidate(claimA, fixedSource({ ...liveEvidenceA, canonicalUrl: null }), now);
    expect(r.identityVerified).toBe(true);
    expect(r.urlVerified).toBe(false);
    expect(r.urlStatus).toBe("not_checked");
    expect(r.canonicalUrl).toBeNull();
  });

  it("dataset evidence confirms identity but can never verify the URL", async () => {
    const r = await verifyProductCandidate(claimA, datasetSource(), now);
    expect(r.identityVerified).toBe(true);
    expect(r.urlVerified).toBe(false);
    expect(r.urlStatus).toBe("not_checked");
    expect(r.retrievalStatus).toBe("cached");
    expect(r.dataSourceType).toBe("dataset");
  });

  it("rejects non-amazon.in URLs without calling the source", async () => {
    let called = false;
    const r = await verifyProductCandidate(
      { ...claimA, url: "https://www.amazon.com/dp/B0FIXTURE1" },
      { retrieve: async () => { called = true; return liveEvidenceA; } },
      now,
    );
    expect(called).toBe(false);
    expect(r.identityVerified).toBe(false);
    expect(r.urlStatus).toBe("failed");
  });

  it("reports 'redirected' when the page lands on a different ASIN", async () => {
    const r = await verifyProductCandidate(claimA, fixedSource({ ...liveEvidenceA, finalUrl: URL_B }), now);
    expect(r.urlStatus).toBe("redirected");
    expect(r.identityVerified).toBe(false);
  });

  it("fails when the canonical URL points to another ASIN", async () => {
    const r = await verifyProductCandidate(claimA, fixedSource({ ...liveEvidenceA, canonicalUrl: URL_B }), now);
    expect(r.urlStatus).toBe("failed");
    expect(r.urlVerified).toBe(false);
  });

  it("fails when the canonical URL is on another marketplace", async () => {
    const r = await verifyProductCandidate(
      claimA,
      fixedSource({ ...liveEvidenceA, canonicalUrl: "https://www.amazon.com/dp/B0FIXTURE1" }),
      now,
    );
    expect(r.urlStatus).toBe("failed");
  });

  it("rejects an identity mismatch (page is a different product)", async () => {
    const r = await verifyProductCandidate(
      claimA,
      fixedSource({ ...liveEvidenceA, title: "Zenith Blender 750W Mixer Grinder", brand: "Zenith", model: null }),
      now,
    );
    expect(r.identityVerified).toBe(false);
    expect(r.urlVerified).toBe(false);
  });

  it.each([
    ["blocked", "blocked"],
    ["unavailable", "unavailable"],
    ["not_checked", "not_checked"],
    ["error", "failed"],
  ] as const)("maps evidence status %s -> url status %s and never verifies", async (status, expected) => {
    const r = await verifyProductCandidate(claimA, fixedSource({ ...liveEvidenceA, status }), now);
    expect(r.urlStatus).toBe(expected);
    expect(r.urlVerified).toBe(false);
    expect(r.identityVerified).toBe(false);
  });

  it("handles an evidence source that throws", async () => {
    const r = await verifyProductCandidate(claimA, { retrieve: async () => { throw new Error("boom"); } }, now);
    expect(r.urlStatus).toBe("unavailable");
    expect(r.identityVerified).toBe(false);
  });

  it("returns unavailable for an ASIN not present in the approved dataset (no guessing)", async () => {
    const r = await verifyProductCandidate({ ...claimA, url: URL_B }, datasetSource(), now);
    expect(r.asin).toBe(ASIN_B);
    expect(r.identityVerified).toBe(false);
    expect(r.urlStatus).toBe("unavailable");
  });
});
