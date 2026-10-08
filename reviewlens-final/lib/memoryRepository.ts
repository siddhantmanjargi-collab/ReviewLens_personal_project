import { randomUUID } from "node:crypto";
import type { NewProduct, NewReview, ProductRecord, ReviewRecord } from "./types";
import type { InsertReviewsResult, Repository } from "./repository";

/** In-memory Repository used by tests. Mirrors the DB's uniqueness and integrity rules. */
export class MemoryRepository implements Repository {
  products = new Map<string, ProductRecord>();
  reviews = new Map<string, ReviewRecord>();

  async findProductByAsin(asin: string) {
    return [...this.products.values()].find((p) => p.asin === asin) ?? null;
  }
  async getProduct(id: string) {
    return this.products.get(id) ?? null;
  }
  async listProducts(limit: number, offset: number) {
    return [...this.products.values()].slice(offset, offset + limit);
  }
  async insertProduct(p: NewProduct) {
    if (!p.identityVerified) throw new Error("identity_verified must be true");
    if (p.urlVerified && (p.urlVerificationStatus !== "verified" || !p.canonicalUrl)) {
      throw new Error("url_verified requires status 'verified' and a canonical URL");
    }
    if (await this.findProductByAsin(p.asin)) throw new Error("duplicate ASIN");
    const rec: ProductRecord = { ...p, id: randomUUID() };
    this.products.set(rec.id, rec);
    return rec;
  }
  async insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult> {
    let inserted = 0;
    let dup = 0;
    for (const r of reviews) {
      const product = this.products.get(r.productId);
      if (!product || product.asin !== r.asin) throw new Error("review (product_id, asin) does not match a product");
      const exists = [...this.reviews.values()].some(
        (e) =>
          e.productId === r.productId &&
          (e.contentHash === r.contentHash || (r.sourceReviewId !== null && e.sourceReviewId === r.sourceReviewId)),
      );
      if (exists) {
        dup += 1;
        continue;
      }
      const rec: ReviewRecord = { ...r, id: randomUUID() };
      this.reviews.set(rec.id, rec);
      inserted += 1;
    }
    return { inserted, duplicatesInDatabase: dup };
  }
  async listReviews(productId: string, limit: number, offset: number) {
    return [...this.reviews.values()].filter((r) => r.productId === productId).slice(offset, offset + limit);
  }
}
