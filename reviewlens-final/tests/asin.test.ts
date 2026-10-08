import { describe, expect, it } from "vitest";
import { isValidAsin, parseAmazonInUrl } from "@/lib/asin";

describe("parseAmazonInUrl", () => {
  it("accepts amazon.in /dp/ URLs and extracts the ASIN", () => {
    const r = parseAmazonInUrl("https://www.amazon.in/Some-Product-Name/dp/B0FIXTURE1/ref=sr_1_1?crid=x");
    expect(r).toEqual({ ok: true, asin: "B0FIXTURE1", candidateUrl: "https://www.amazon.in/dp/B0FIXTURE1" });
  });
  it("accepts /gp/product/ and /product-reviews/ paths", () => {
    expect(parseAmazonInUrl("https://amazon.in/gp/product/B0FIXTURE1").ok).toBe(true);
    expect(parseAmazonInUrl("https://www.amazon.in/product-reviews/B0FIXTURE1").ok).toBe(true);
  });
  it.each([
    ["https://www.amazon.com/dp/B0FIXTURE1", "wrong_marketplace"],
    ["https://www.amazon.co.uk/dp/B0FIXTURE1", "wrong_marketplace"],
    ["https://www.amazon.ae/dp/B0FIXTURE1", "wrong_marketplace"],
    ["https://amazon.in.evil.com/dp/B0FIXTURE1", "wrong_marketplace"],
    ["https://amazon.in@evil.com/dp/B0FIXTURE1", "wrong_marketplace"],
    ["https://evil.com/amazon.in/dp/B0FIXTURE1", "wrong_marketplace"],
  ])("rejects non-amazon.in host %s", (url, reason) => {
    const r = parseAmazonInUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
  it("rejects search URLs instead of treating them as product URLs", () => {
    const r = parseAmazonInUrl("https://www.amazon.in/s?k=phone");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("search_or_listing_url");
  });
  it("rejects garbage, non-http schemes, short/lowercase/long ASINs", () => {
    expect(parseAmazonInUrl("not a url").ok).toBe(false);
    expect(parseAmazonInUrl("ftp://www.amazon.in/dp/B0FIXTURE1").ok).toBe(false);
    expect(parseAmazonInUrl("https://www.amazon.in/dp/B0SHORT").ok).toBe(false);
    expect(parseAmazonInUrl("https://www.amazon.in/dp/b0fixture1").ok).toBe(false);
    expect(parseAmazonInUrl("https://www.amazon.in/dp/B0FIXTURE123").ok).toBe(false);
    expect(parseAmazonInUrl("https://www.amazon.in/").ok).toBe(false);
  });
});

describe("isValidAsin", () => {
  it("validates shape only", () => {
    expect(isValidAsin("B0FIXTURE1")).toBe(true);
    expect(isValidAsin("b0fixture1")).toBe(false);
    expect(isValidAsin("B0FIX")).toBe(false);
    expect(isValidAsin(123)).toBe(false);
  });
});
