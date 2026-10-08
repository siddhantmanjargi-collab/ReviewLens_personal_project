import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/lib/memoryRepository";
import { isAdminAuthorized } from "@/lib/auth";
import type { RequestContext } from "@/lib/context";
import { handleGetProduct, handleImportProduct, handleImportReviews, handleListProducts } from "@/lib/handlers";
import { ASIN_A, claimA, datasetSource } from "./fixtures";

const KEY = "test-admin-key-123";
const ctx = (): RequestContext => ({ repo: new MemoryRepository(), evidence: datasetSource(), adminApiKey: KEY });

describe("auth", () => {
  it("compares keys safely", () => {
    expect(isAdminAuthorized(KEY, KEY)).toBe(true);
    expect(isAdminAuthorized("wrong-key-12345678", KEY)).toBe(false);
    expect(isAdminAuthorized("short", KEY)).toBe(false);
    expect(isAdminAuthorized(null, KEY)).toBe(false);
    expect(isAdminAuthorized("", "")).toBe(false);
  });
});

describe("handlers", () => {
  it("write endpoints require the admin key", async () => {
    const c = ctx();
    expect((await handleImportProduct(c, null, claimA)).status).toBe(401);
    expect((await handleImportProduct(c, "nope", claimA)).status).toBe(401);
    expect((await handleImportReviews(c, null, "x", {})).status).toBe(401);
  });

  it("validates request bodies", async () => {
    expect((await handleImportProduct(ctx(), KEY, { url: "" })).status).toBe(400);
    expect((await handleImportReviews(ctx(), KEY, "11111111-1111-4111-8111-111111111111", { reviews: [] })).status).toBe(400);
  });

  it("returns 422 for a rejected product, 201 for created, 200 for duplicate", async () => {
    const c = ctx();
    const bad = await handleImportProduct(c, KEY, { ...claimA, url: "https://www.amazon.com/dp/B0FIXTURE1" });
    expect(bad.status).toBe(422);
    const created = await handleImportProduct(c, KEY, claimA);
    expect(created.status).toBe(201);
    const dup = await handleImportProduct(c, KEY, claimA);
    expect(dup.status).toBe(200);
    expect((dup.body as { status: string }).status).toBe("duplicate");
  });

  it("imports reviews end to end and rejects cross-product reviews", async () => {
    const c = ctx();
    const created = await handleImportProduct(c, KEY, claimA);
    const id = (created.body as { product: { id: string } }).product.id;
    const res = await handleImportReviews(c, KEY, id, {
      dataSourceType: "dataset",
      reviews: [
        { asin: ASIN_A, reviewText: "Works well.", rating: 5 },
        { asin: "B0FIXTURE2", reviewText: "Wrong product.", rating: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 1, rejected: [{ index: 1 }] });
  });

  it("rejects dataSourceType values that would pretend to be live data", async () => {
    const c = ctx();
    const created = await handleImportProduct(c, KEY, claimA);
    const id = (created.body as { product: { id: string } }).product.id;
    const res = await handleImportReviews(c, KEY, id, {
      dataSourceType: "live_retrieval",
      reviews: [{ asin: ASIN_A, reviewText: "x", rating: 5 }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-UUID ids and 404 for unknown products", async () => {
    expect((await handleGetProduct(ctx(), "not-a-uuid")).status).toBe(400);
    expect((await handleGetProduct(ctx(), "11111111-1111-4111-8111-111111111111")).status).toBe(404);
  });

  it("validates pagination", async () => {
    expect((await handleListProducts(ctx(), new URLSearchParams("limit=1000"))).status).toBe(400);
    expect((await handleListProducts(ctx(), new URLSearchParams("limit=5"))).status).toBe(200);
  });
});
