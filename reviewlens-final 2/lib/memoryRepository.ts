import { randomUUID } from "node:crypto";
import type {
  AnalysisRunRecord,
  Marketplace,
  NewProduct,
  NewProductAnalysis,
  NewReview,
  NewReviewAnalysis,
  ProductAnalysisRecord,
  ProductAspectRecord,
  ProductRecord,
  ReviewAnalysisRecord,
  ReviewRecord,
} from "./types";
import type { InsertReviewsResult, ListReviewsOptions, Repository } from "./repository";

/** In-memory Repository used by tests. Mirrors the database's uniqueness and integrity rules. */
export class MemoryRepository implements Repository {
  products = new Map<string, ProductRecord>();
  reviews = new Map<string, ReviewRecord>();
  analyses: ReviewAnalysisRecord[] = [];
  productAnalyses = new Map<string, ProductAnalysisRecord>();
  aspects = new Map<string, ProductAspectRecord[]>();
  runs = new Map<string, AnalysisRunRecord>();
  now: () => Date = () => new Date();

  async findProduct(source: Marketplace, externalId: string) {
    return [...this.products.values()].find((p) => p.source === source && p.externalId === externalId) ?? null;
  }
  async getProduct(id: string) {
    return this.products.get(id) ?? null;
  }
  async listProducts(limit: number, offset: number) {
    return [...this.products.values()].slice(offset, offset + limit);
  }
  async insertProduct(p: NewProduct) {
    if (p.verificationLevel === "verified" && !p.identityVerified) throw new Error("verified products need identity_verified");
    if (p.verificationLevel !== "verified" && p.urlVerified) throw new Error("only verified products can have url_verified");
    if (p.urlVerified && (p.urlVerificationStatus !== "verified" || !p.canonicalUrl)) {
      throw new Error("url_verified requires status 'verified' and a canonical URL");
    }
    if (await this.findProduct(p.source, p.externalId)) throw new Error("duplicate product");
    const rec: ProductRecord = { ...p, id: randomUUID() };
    this.products.set(rec.id, rec);
    return rec;
  }
  async insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult> {
    let inserted = 0;
    let dup = 0;
    for (const r of reviews) {
      const product = this.products.get(r.productId);
      if (!product || product.externalId !== r.externalId) throw new Error("review (product_id, external_id) does not match a product");
      if (r.dataSourceType === "user_pasted" && r.isPublic) throw new Error("pasted reviews cannot be public");
      const exists = [...this.reviews.values()].some(
        (e) =>
          e.productId === r.productId &&
          (e.contentHash === r.contentHash || (r.sourceReviewId !== null && e.sourceReviewId === r.sourceReviewId)),
      );
      if (exists) {
        dup += 1;
        continue;
      }
      const rec: ReviewRecord = { ...r, id: randomUUID(), analysisAttempts: 0, lastAnalysisError: null };
      this.reviews.set(rec.id, rec);
      inserted += 1;
    }
    return { inserted, duplicatesInDatabase: dup };
  }
  async listReviews(productId: string, o: ListReviewsOptions) {
    return [...this.reviews.values()]
      .filter((r) => r.productId === productId && (!o.publicOnly || r.isPublic))
      .slice(o.offset, o.offset + o.limit);
  }
  async getReview(id: string) {
    return this.reviews.get(id) ?? null;
  }
  async reviewsForProduct(productId: string, max: number) {
    return [...this.reviews.values()].filter((r) => r.productId === productId).slice(-max).reverse();
  }

  async pendingReviews(model: string, promptVersion: string, maxAttempts: number, limit: number) {
    return [...this.reviews.values()]
      .filter(
        (r) =>
          r.analysisAttempts < maxAttempts &&
          !this.analyses.some((a) => a.reviewId === r.id && a.model === model && a.promptVersion === promptVersion),
      )
      .slice(0, limit);
  }
  async saveAnalyses(rows: NewReviewAnalysis[]) {
    for (const row of rows) {
      if (!this.reviews.has(row.reviewId)) throw new Error("analysis for unknown review");
      if (row.authenticityRisk < 0 || row.authenticityRisk > 1) throw new Error("authenticity_risk out of range");
      if (row.sentimentConfidence < 0 || row.sentimentConfidence > 1) throw new Error("sentiment_confidence out of range");
      const idx = this.analyses.findIndex(
        (a) => a.reviewId === row.reviewId && a.model === row.model && a.promptVersion === row.promptVersion,
      );
      const rec: ReviewAnalysisRecord = { ...row, id: idx >= 0 ? this.analyses[idx]!.id : randomUUID(), analyzedAt: this.now().toISOString() };
      if (idx >= 0) this.analyses[idx] = rec;
      else this.analyses.push(rec);
    }
  }
  async markAnalysisFailed(reviewIds: string[], error: string) {
    for (const id of reviewIds) {
      const r = this.reviews.get(id);
      if (r) this.reviews.set(id, { ...r, analysisAttempts: r.analysisAttempts + 1, lastAnalysisError: error.slice(0, 500) });
    }
  }
  async analysesForProduct(productId: string, model: string, promptVersion: string) {
    const ids = new Set([...this.reviews.values()].filter((r) => r.productId === productId).map((r) => r.id));
    return this.analyses.filter((a) => ids.has(a.reviewId) && a.model === model && a.promptVersion === promptVersion);
  }
  async getReviewAnalysis(reviewId: string, model: string, promptVersion: string) {
    return this.analyses.find((a) => a.reviewId === reviewId && a.model === model && a.promptVersion === promptVersion) ?? null;
  }

  async saveProductAggregates(productId: string, analysis: NewProductAnalysis, aspects: Omit<ProductAspectRecord, "productId">[]) {
    const sum = analysis.positiveCount + analysis.neutralCount + analysis.negativeCount;
    if (sum !== analysis.reviewsAnalyzed) throw new Error("sentiment counts must add up to reviews_analyzed");
    if (analysis.reviewsAnalyzed > analysis.reviewsTotal) throw new Error("reviews_analyzed > reviews_total");
    for (const a of aspects) {
      if (a.positiveCount + a.neutralCount + a.negativeCount !== a.mentionCount) throw new Error("aspect counts inconsistent");
    }
    this.productAnalyses.set(productId, { ...analysis, productId, computedAt: this.now().toISOString() });
    this.aspects.set(productId, aspects.map((a) => ({ ...a, productId })));
  }
  async getProductAnalysis(productId: string) {
    return this.productAnalyses.get(productId) ?? null;
  }
  async listProductAspects(productId: string) {
    return this.aspects.get(productId) ?? [];
  }

  async startRun(run: Pick<AnalysisRunRecord, "trigger" | "model" | "promptVersion">) {
    const rec: AnalysisRunRecord = {
      id: randomUUID(), startedAt: this.now().toISOString(), finishedAt: null, ...run,
      status: "running", reviewsAttempted: 0, reviewsSucceeded: 0, reviewsFailed: 0, note: null,
    };
    this.runs.set(rec.id, rec);
    return rec;
  }
  async finishRun(id: string, result: Pick<AnalysisRunRecord, "status" | "reviewsAttempted" | "reviewsSucceeded" | "reviewsFailed" | "note">) {
    const r = this.runs.get(id);
    if (r) this.runs.set(id, { ...r, ...result, finishedAt: this.now().toISOString() });
  }
}
