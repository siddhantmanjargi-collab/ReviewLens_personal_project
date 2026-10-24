import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/lib/memoryRepository";
import { importProduct } from "@/lib/productImport";
import { importReviews } from "@/lib/reviewImport";
import { ASIN_A, ASIN_B, claimA, datasetSource, fixedSource, liveEvidenceA, URL_B } from "./fixtures";

const now = () => new Date("2026-02-02T00:00:00.000Z");

describe("importProduct", () => {
  it("stores a live-verified product with url_verified true", async () => {
    const repo = new MemoryRepository();
    const out = await importProduct(claimA, { repo, evidence: fixedSource(liveEvidenceA), now });
    expect(out.status).toBe("created");
    if (out.status !== "created") return;
    expect(out.product.urlVerified).toBe(true);
    expect(out.product.canonicalUrl).toBe("https://www.amazon.in/dp/B0FIXTURE1");
    expect(out.product.retrievalStatus).toBe("live");
  });

  it("stores dataset-backed products as identity-verified but URL NOT verified, with real values only", async () => {
    const repo = new MemoryRepository();
    const out = await importProduct(claimA, { repo, evidence: datasetSource(), now });
    expect(out.status).toBe("created");
    if (out.status !== "created") return;
    const p = out.product;
    expect(p.identityVerified).toBe(true);
    expect(p.urlVerified).toBe(false);
    expect(p.urlVerificationStatus).toBe("not_checked");
    expect(p.canonicalUrl).toBeNull();
    expect(p.retrievalStatus).toBe("cached");
    expect(p.price).toBe(15999);
    expect(p.discountPercent).toBe(20);
    expect(p.specs).toEqual({ RAM: "8GB", Storage: "128GB" });
    // fields the dataset did not provide are null and listed as unavailable, not guessed
    expect(p.rating).toBeNull();
    expect(p.unavailableFields).toEqual(expect.arrayContaining(["rating", "reviewCount", "manufacturer", "imageUrl"]));
    expect(p.unavailableFields).not.toContain("price");
  });

  it("rejects and stores nothing when identity cannot be established", async () => {
    const repo = new MemoryRepository();
    const out = await importProduct({ ...claimA, url: URL_B }, { repo, evidence: datasetSource(), now });
    expect(out.status).toBe("rejected");
    expect(repo.products.size).toBe(0);
  });

  it("rejects when the claimed name belongs to another product", async () => {
    const repo = new MemoryRepository();
    const out = await importProduct(
      { ...claimA, productName: "Zenith Blender 750W Mixer Grinder", brand: "Zenith", model: null },
      { repo, evidence: datasetSource(), now },
    );
    expect(out.status).toBe("rejected");
    expect(repo.products.size).toBe(0);
  });

  it("detects duplicate ASINs and does not create a second record", async () => {
    const repo = new MemoryRepository();
    await importProduct(claimA, { repo, evidence: datasetSource(), now });
    const again = await importProduct(claimA, { repo, evidence: datasetSource(), now });
    expect(again.status).toBe("duplicate");
    expect(repo.products.size).toBe(1);
  });

  it("repository refuses to store url_verified without status 'verified' and a canonical URL", async () => {
    const repo = new MemoryRepository();
    const out = await importProduct(claimA, { repo, evidence: datasetSource(), now });
    if (out.status !== "created") throw new Error("setup failed");
    const { id: _id, ...rest } = out.product;
    await expect(repo.insertProduct({ ...rest, externalId: ASIN_B, urlVerified: true })).rejects.toThrow();
  });
});

describe("importReviews", () => {
  async function setup() {
    const repo = new MemoryRepository();
    const out = await importProduct(claimA, { repo, evidence: datasetSource(), now });
    if (out.status !== "created") throw new Error("setup failed");
    return { repo, product: out.product };
  }
  const r1 = { externalId: ASIN_A, reviewText: "Camera is average in low light.", rating: 3, sourceReviewId: "R1" };

  it("inserts reviews and attaches them to the right product", async () => {
    const { repo, product } = await setup();
    const out = await importReviews(product.id, [r1], "dataset", { repo, now });
    expect(out).toMatchObject({ status: "ok", inserted: 1, duplicates: 0, rejected: [] });
    expect((await repo.listReviews(product.id, { publicOnly: true, limit: 10, offset: 0 }))[0]!.externalId).toBe(ASIN_A);
  });

  it("rejects reviews that belong to another product and stores none of them", async () => {
    const { repo, product } = await setup();
    const out = await importReviews(product.id, [{ ...r1, externalId: ASIN_B }], "dataset", { repo, now });
    expect(out).toMatchObject({ status: "ok", inserted: 0 });
    expect(repo.reviews.size).toBe(0);
  });

  it("detects duplicates already in the database on re-import", async () => {
    const { repo, product } = await setup();
    await importReviews(product.id, [r1], "dataset", { repo, now });
    const again = await importReviews(product.id, [r1], "dataset", { repo, now });
    expect(again).toMatchObject({ status: "ok", inserted: 0, duplicates: 1 });
    expect(repo.reviews.size).toBe(1);
  });

  it("returns product_not_found for an unknown product", async () => {
    const out = await importReviews("22222222-2222-4222-8222-222222222222", [r1], "dataset", { repo: new MemoryRepository(), now });
    expect(out).toEqual({ status: "product_not_found" });
  });

  it("memory repository enforces the (product_id, external_id) integrity rule", async () => {
    const { repo, product } = await setup();
    const prepared = {
      productId: product.id, externalId: ASIN_B, source: "amazon.in" as const, isPublic: true, sourceReviewId: null, contentHash: "h",
      reviewTitle: null, reviewText: "x", rating: 3, reviewDate: null, verifiedPurchase: null, reviewerName: null,
      helpfulVotes: null, dataSourceType: "dataset" as const, retrievedAt: "2026-01-01T00:00:00.000Z",
    };
    await expect(repo.insertReviews([prepared])).rejects.toThrow();
  });
});
