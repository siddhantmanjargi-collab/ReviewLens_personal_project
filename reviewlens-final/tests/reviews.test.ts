import { describe, expect, it } from "vitest";
import { computeContentHash, prepareReviews } from "@/lib/reviews";
import { ASIN_A, ASIN_B } from "./fixtures";

const product = { id: "11111111-1111-4111-8111-111111111111", asin: ASIN_A };
const base = { asin: ASIN_A, reviewText: "Battery lasts two days with my usage.", rating: 4 };
const prep = (items: unknown[]) => prepareReviews(product, items, "dataset", "2026-01-01T00:00:00.000Z");

describe("prepareReviews", () => {
  it("accepts a valid review and leaves absent optional fields null (no fabrication)", () => {
    const r = prep([base]);
    expect(r.accepted).toHaveLength(1);
    const rev = r.accepted[0]!;
    expect(rev.productId).toBe(product.id);
    expect(rev.reviewTitle).toBeNull();
    expect(rev.reviewDate).toBeNull();
    expect(rev.verifiedPurchase).toBeNull();
    expect(rev.reviewerName).toBeNull();
    expect(rev.sourceReviewId).toBeNull();
  });

  it("rejects a review that belongs to a different product's ASIN", () => {
    const r = prep([{ ...base, asin: ASIN_B }]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/belongs to ASIN/);
  });

  it("rejects a review with no ASIN at all", () => {
    const { asin: _a, ...noAsin } = base;
    expect(prep([noAsin]).accepted).toHaveLength(0);
  });

  it("rejects empty text, out-of-range ratings, fractional ratings and bad dates", () => {
    expect(prep([{ ...base, reviewText: "   " }]).rejected).toHaveLength(1);
    expect(prep([{ ...base, rating: 0 }]).rejected).toHaveLength(1);
    expect(prep([{ ...base, rating: 6 }]).rejected).toHaveLength(1);
    expect(prep([{ ...base, rating: 3.5 }]).rejected).toHaveLength(1);
    expect(prep([{ ...base, reviewDate: "12/01/2026" }]).rejected).toHaveLength(1);
  });

  it("drops duplicates in the same batch by content, ignoring case/punctuation", () => {
    const r = prep([base, { ...base, reviewText: "battery lasts two days with my usage" }]);
    expect(r.accepted).toHaveLength(1);
    expect(r.duplicatesInBatch).toBe(1);
  });

  it("drops duplicates by source review id", () => {
    const r = prep([
      { ...base, sourceReviewId: "R1" },
      { ...base, reviewText: "Different text entirely.", sourceReviewId: "R1" },
    ]);
    expect(r.accepted).toHaveLength(1);
    expect(r.duplicatesInBatch).toBe(1);
  });

  it("keeps same text with a different rating as distinct reviews", () => {
    expect(prep([base, { ...base, rating: 1 }]).accepted).toHaveLength(2);
  });

  it("content hash is stable", () => {
    expect(computeContentHash(base)).toBe(computeContentHash({ ...base }));
  });
});
