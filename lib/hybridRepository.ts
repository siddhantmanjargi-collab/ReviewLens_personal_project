import type { MemoryRepository } from "./memoryRepository";
import type { InsertReviewsResult, ListReviewsOptions, Repository } from "./repository";
import type {
  AnalysisRunRecord,
  Marketplace,
  NewProduct,
  NewProductAnalysis,
  NewReview,
  NewReviewAnalysis,
  ProductAspectRecord,
  ProductRecord,
} from "./types";

/**
 * Wraps an external database repository (e.g. SupabaseRepository) with our seeded
 * 30-product catalog + 180 real product-specific reviews fallback.
 *
 * Why this matters:
 * - If a user connects a fresh or Phase-1 Supabase project where `image_url` was null
 *   or `reviews` was empty, products never lose their official images, verified links,
 *   or 180 seeded customer reviews.
 * - Any new products or reviews written by the user still write to the primary store
 *   (falling back cleanly to the in-memory/disk store if the remote table lacks columns).
 */
export class HybridCatalogRepository implements Repository {
  constructor(
    private readonly primary: Repository,
    private readonly catalogFallback: MemoryRepository,
  ) {}

  private enrichProduct(p: ProductRecord): ProductRecord {
    const seeded = [...this.catalogFallback.products.values()].find(
      (s) => s.externalId === p.externalId && s.source === p.source,
    );
    if (!seeded) return p;
    return {
      ...p,
      imageUrl: p.imageUrl || seeded.imageUrl,
      remoteImageUrl: p.remoteImageUrl || seeded.remoteImageUrl,
      officialUrl: p.officialUrl || seeded.officialUrl,
      canonicalUrl: p.canonicalUrl || seeded.canonicalUrl,
      sourceUrl: p.sourceUrl || seeded.sourceUrl,
      description: p.description || seeded.description,
      price: p.price ?? seeded.price,
      mrp: p.mrp ?? seeded.mrp,
      discountPercent: p.discountPercent ?? seeded.discountPercent,
      rating: p.rating ?? seeded.rating,
      reviewCount: p.reviewCount || seeded.reviewCount,
      specs: Object.keys(p.specs ?? {}).length > 0 ? p.specs : seeded.specs,
    };
  }

  private findSeededProductByAnyId(idOrProduct: string | ProductRecord | null): ProductRecord | null {
    if (!idOrProduct) return null;
    if (typeof idOrProduct === "string") {
      const direct = this.catalogFallback.products.get(idOrProduct);
      if (direct) return direct;
      return null;
    }
    return (
      this.catalogFallback.products.get(idOrProduct.id) ??
      [...this.catalogFallback.products.values()].find(
        (s) => s.externalId === idOrProduct.externalId && s.source === idOrProduct.source,
      ) ??
      null
    );
  }

  async findProduct(source: Marketplace, externalId: string) {
    try {
      const p = await this.primary.findProduct(source, externalId);
      if (p) return this.enrichProduct(p);
    } catch {
      // Fallback to seeded catalog
    }
    return this.catalogFallback.findProduct(source, externalId);
  }

  async getProduct(id: string) {
    try {
      const p = await this.primary.getProduct(id);
      if (p) return this.enrichProduct(p);
    } catch {
      // Fallback to seeded catalog
    }
    return this.catalogFallback.getProduct(id);
  }

  async listProducts(limit: number, offset: number) {
    let remote: ProductRecord[] = [];
    try {
      remote = (await this.primary.listProducts(200, 0)).map((p) => this.enrichProduct(p));
    } catch {
      return this.catalogFallback.listProducts(limit, offset);
    }
    const seenKeys = new Set(remote.map((p) => `${p.source}:${p.externalId}`));
    const seededMissing = [...this.catalogFallback.products.values()].filter(
      (s) => !seenKeys.has(`${s.source}:${s.externalId}`),
    );
    const merged = [...remote, ...seededMissing];
    return merged.slice(offset, offset + limit);
  }

  async insertProduct(product: NewProduct) {
    try {
      return await this.primary.insertProduct(product);
    } catch {
      return this.catalogFallback.insertProduct(product);
    }
  }

  async insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult> {
    try {
      return await this.primary.insertReviews(reviews);
    } catch {
      return this.catalogFallback.insertReviews(reviews);
    }
  }

  async listReviews(productId: string, options: ListReviewsOptions) {
    try {
      const rows = await this.primary.listReviews(productId, options);
      if (rows.length > 0) return rows;
      const prod = await this.getProduct(productId);
      const seeded = this.findSeededProductByAnyId(prod ?? productId);
      if (seeded) {
        const fallbackRows = await this.catalogFallback.listReviews(seeded.id, options);
        return fallbackRows.map((r) => ({ ...r, productId }));
      }
    } catch {
      // Fallback below
    }
    return this.catalogFallback.listReviews(productId, options);
  }

  async getReview(id: string) {
    try {
      const r = await this.primary.getReview(id);
      if (r) return r;
    } catch {
      // Fallback
    }
    return this.catalogFallback.getReview(id);
  }

  async reviewsForProduct(productId: string, max: number) {
    try {
      const rows = await this.primary.reviewsForProduct(productId, max);
      if (rows.length > 0) return rows;
      const prod = await this.getProduct(productId);
      const seeded = this.findSeededProductByAnyId(prod ?? productId);
      if (seeded) {
        const fallbackRows = await this.catalogFallback.reviewsForProduct(seeded.id, max);
        return fallbackRows.map((r) => ({ ...r, productId }));
      }
    } catch {
      // Fallback
    }
    return this.catalogFallback.reviewsForProduct(productId, max);
  }

  async pendingReviews(model: string, promptVersion: string, maxAttempts: number, limit: number) {
    try {
      return await this.primary.pendingReviews(model, promptVersion, maxAttempts, limit);
    } catch {
      return this.catalogFallback.pendingReviews(model, promptVersion, maxAttempts, limit);
    }
  }

  async saveAnalyses(rows: NewReviewAnalysis[]) {
    try {
      await this.primary.saveAnalyses(rows);
    } catch {
      await this.catalogFallback.saveAnalyses(rows);
    }
  }

  async markAnalysisFailed(reviewIds: string[], error: string) {
    try {
      await this.primary.markAnalysisFailed(reviewIds, error);
    } catch {
      await this.catalogFallback.markAnalysisFailed(reviewIds, error);
    }
  }

  async analysesForProduct(productId: string, model: string, promptVersion: string) {
    try {
      const rows = await this.primary.analysesForProduct(productId, model, promptVersion);
      if (rows.length > 0) return rows;
      const prod = await this.getProduct(productId);
      const seeded = this.findSeededProductByAnyId(prod ?? productId);
      if (seeded) {
        return this.catalogFallback.analysesForProduct(seeded.id, model, promptVersion);
      }
    } catch {
      // Fallback
    }
    return this.catalogFallback.analysesForProduct(productId, model, promptVersion);
  }

  async getReviewAnalysis(reviewId: string, model: string, promptVersion: string) {
    try {
      const row = await this.primary.getReviewAnalysis(reviewId, model, promptVersion);
      if (row) return row;
    } catch {
      // Fallback
    }
    return this.catalogFallback.getReviewAnalysis(reviewId, model, promptVersion);
  }

  async saveProductAggregates(
    productId: string,
    analysis: NewProductAnalysis,
    aspects: Omit<ProductAspectRecord, "productId">[],
  ) {
    try {
      await this.primary.saveProductAggregates(productId, analysis, aspects);
    } catch {
      await this.catalogFallback.saveProductAggregates(productId, analysis, aspects);
    }
  }

  async getProductAnalysis(productId: string) {
    try {
      const row = await this.primary.getProductAnalysis(productId);
      if (row) return row;
      const prod = await this.getProduct(productId);
      const seeded = this.findSeededProductByAnyId(prod ?? productId);
      if (seeded) {
        const fb = await this.catalogFallback.getProductAnalysis(seeded.id);
        return fb ? { ...fb, productId } : null;
      }
    } catch {
      // Fallback
    }
    return this.catalogFallback.getProductAnalysis(productId);
  }

  async listProductAspects(productId: string) {
    try {
      const rows = await this.primary.listProductAspects(productId);
      if (rows.length > 0) return rows;
      const prod = await this.getProduct(productId);
      const seeded = this.findSeededProductByAnyId(prod ?? productId);
      if (seeded) {
        const fb = await this.catalogFallback.listProductAspects(seeded.id);
        return fb.map((a) => ({ ...a, productId }));
      }
    } catch {
      // Fallback
    }
    return this.catalogFallback.listProductAspects(productId);
  }

  async startRun(run: Pick<AnalysisRunRecord, "trigger" | "model" | "promptVersion">) {
    try {
      return await this.primary.startRun(run);
    } catch {
      return this.catalogFallback.startRun(run);
    }
  }

  async finishRun(
    id: string,
    result: Pick<AnalysisRunRecord, "status" | "reviewsAttempted" | "reviewsSucceeded" | "reviewsFailed" | "note">,
  ) {
    try {
      await this.primary.finishRun(id, result);
    } catch {
      await this.catalogFallback.finishRun(id, result);
    }
  }
}
