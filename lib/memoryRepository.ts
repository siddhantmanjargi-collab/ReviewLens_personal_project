import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import catalogJson from "../data/approved-catalog.json";
import productReviewsJson from "../data/product-reviews.json";
import { computeProductAggregates } from "./aggregate";
import { DEFAULT_GEMINI_MODEL } from "./config";
import { combineRisk, heuristicSignals, ratingMismatch } from "./detector";
import { PROMPT_VERSION } from "./gemini";
import type {
  AnalysisRunRecord,
  AspectResult,
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
  Sentiment,
} from "./types";
import type { InsertReviewsResult, ListReviewsOptions, Repository } from "./repository";

const CUSTOM_STORE_PATH = "/tmp/reviewlens-custom-store.json";

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface SampleReviewSeed {
  title: string;
  text: string;
  rating: number;
  verified: boolean;
  reviewer: string;
  daysAgo: number;
  helpful: number;
  sentiment: Sentiment;
  confidence: number;
  geminiRisk: number;
  aspects: AspectResult[];
  signals: string[];
}

interface PersistedCustomState {
  customProducts: ProductRecord[];
  customReviews: ReviewRecord[];
  customAnalyses: ReviewAnalysisRecord[];
  customProductAnalyses: [string, ProductAnalysisRecord][];
  customAspects: [string, ProductAspectRecord[]][];
}

const FALLBACK_SEEDS: SampleReviewSeed[] = [
  {
    title: "Reliable daily performance and solid build quality",
    text: "Used daily for two weeks—hardware build feels sturdy, setup took under 5 minutes, and performance matches the advertised specifications.",
    rating: 5,
    verified: true,
    reviewer: "Rohan Kulkarni",
    daysAgo: 6,
    helpful: 18,
    sentiment: "positive",
    confidence: 0.92,
    geminiRisk: 0.09,
    aspects: [
      { name: "performance", sentiment: "positive", confidence: 0.92 },
      { name: "build quality", sentiment: "positive", confidence: 0.90 },
    ],
    signals: ["Concrete two-week usage feedback"],
  },
];

const REVIEWS_BY_ASIN = (productReviewsJson as unknown as { reviewsByAsin: Record<string, SampleReviewSeed[]> })
  .reviewsByAsin;

export class MemoryRepository implements Repository {
  products = new Map<string, ProductRecord>();
  reviews = new Map<string, ReviewRecord>();
  analyses: ReviewAnalysisRecord[] = [];
  productAnalyses = new Map<string, ProductAnalysisRecord>();
  aspects = new Map<string, ProductAspectRecord[]>();
  runs = new Map<string, AnalysisRunRecord>();
  private seededProductIds = new Set<string>();
  private seededReviewIds = new Set<string>();
  private seededAnalysisIds = new Set<string>();
  private persistEnabled = false;
  now: () => Date = () => new Date();

  constructor(seedCatalog = true) {
    if (seedCatalog) {
      this.seedFromApprovedCatalog();
      this.persistEnabled = true;
      this.hydrateCustomStore();
    }
  }

  private hydrateCustomStore() {
    if (!this.persistEnabled) return;
    try {
      if (!fs.existsSync(CUSTOM_STORE_PATH)) return;
      const parsed = JSON.parse(fs.readFileSync(CUSTOM_STORE_PATH, "utf8")) as Partial<PersistedCustomState>;
      for (const p of parsed.customProducts ?? []) {
        if (!this.products.has(p.id)) {
          this.products.set(p.id, p);
        }
      }
      for (const r of parsed.customReviews ?? []) {
        if (!this.reviews.has(r.id)) {
          this.reviews.set(r.id, r);
        }
      }
      for (const a of parsed.customAnalyses ?? []) {
        if (!this.analyses.some((existing) => existing.id === a.id)) {
          this.analyses.push(a);
        }
      }
      for (const [pid, pa] of parsed.customProductAnalyses ?? []) {
        this.productAnalyses.set(pid, pa);
      }
      for (const [pid, asp] of parsed.customAspects ?? []) {
        this.aspects.set(pid, asp);
      }
    } catch {
      // Ignore corrupt or inaccessible /tmp persistence
    }
  }

  private persistCustomStore() {
    if (!this.persistEnabled) return;
    try {
      const customProducts = [...this.products.values()].filter((p) => !this.seededProductIds.has(p.id));
      const customReviews = [...this.reviews.values()].filter((r) => !this.seededReviewIds.has(r.id));
      const customAnalyses = this.analyses.filter((a) => !this.seededAnalysisIds.has(a.id));
      const touchedProductIds = new Set<string>([
        ...customProducts.map((p) => p.id),
        ...customReviews.map((r) => r.productId),
      ]);
      const customProductAnalyses: [string, ProductAnalysisRecord][] = [];
      const customAspects: [string, ProductAspectRecord[]][] = [];
      for (const pid of touchedProductIds) {
        const pa = this.productAnalyses.get(pid);
        if (pa) customProductAnalyses.push([pid, pa]);
        const asp = this.aspects.get(pid);
        if (asp) customAspects.push([pid, asp]);
      }
      const state: PersistedCustomState = {
        customProducts,
        customReviews,
        customAnalyses,
        customProductAnalyses,
        customAspects,
      };
      fs.writeFileSync(CUSTOM_STORE_PATH, JSON.stringify(state));
    } catch {
      // Non-fatal in read-only serverless containers
    }
  }

  private seedFromApprovedCatalog() {
    const capturedAt = catalogJson.capturedAt ?? "2026-10-25T06:00:00.000Z";
    const baseDate = new Date("2026-10-25T06:00:00.000Z");

    for (const [idx, rec] of catalogJson.records.entries()) {
      const productId = deterministicUuid(`product:${rec.asin}`);
      const price = rec.price ?? null;
      const mrp = rec.mrp ?? null;
      const discountPercent =
        price !== null && mrp !== null && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

      const remoteImageUrl =
        (rec as { remoteImageUrl?: string | null }).remoteImageUrl ?? null;

      const product: ProductRecord = {
        id: productId,
        source: "amazon.in",
        externalId: rec.asin,
        verificationLevel: "verified",
        productName: rec.title,
        brand: rec.brand ?? null,
        manufacturer: rec.manufacturer ?? null,
        model: rec.model ?? null,
        category: rec.category ?? "Electronics",
        deviceType: rec.deviceType ?? null,
        description: rec.description ?? null,
        imageUrl: rec.imageUrl ?? null,
        remoteImageUrl,
        price,
        mrp,
        discountPercent,
        currency: "INR",
        rating: rec.rating ?? null,
        reviewCount: rec.reviewCount ?? 0,
        availability: rec.availability ?? "In Stock",
        specs: Object.fromEntries(
          Object.entries(rec.specs ?? {}).filter(
            (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
          ),
        ),
        unavailableFields: [],
        sourceUrl: rec.canonicalUrl ?? `https://www.amazon.in/dp/${rec.asin}`,
        canonicalUrl: rec.canonicalUrl ?? `https://www.amazon.in/dp/${rec.asin}`,
        officialUrl: rec.officialUrl ?? null,
        urlVerified: true,
        urlVerificationStatus: "verified",
        identityVerified: true,
        retrievalStatus: "cached",
        dataSourceType: "dataset",
        lastCheckedAt: capturedAt,
      };
      this.products.set(productId, product);
      this.seededProductIds.add(productId);

      const activeSeeds = REVIEWS_BY_ASIN[rec.asin] ?? FALLBACK_SEEDS;
      const createdReviews: ReviewRecord[] = [];

      for (const [rIdx, s] of activeSeeds.entries()) {
        const revId = deterministicUuid(`review:${rec.asin}:${rIdx}`);
        const d = new Date(baseDate.getTime() - (s.daysAgo + (idx % 3)) * 86_400_000);
        const dateStr = d.toISOString().slice(0, 10);
        const rev: ReviewRecord = {
          id: revId,
          productId,
          externalId: rec.asin,
          source: "amazon.in",
          sourceReviewId: `REV-${rec.asin}-${rIdx + 1}`,
          contentHash: createHash("sha256").update(`${rec.asin}:${rIdx}:${s.text}`).digest("hex"),
          reviewTitle: s.title,
          reviewText: s.text,
          rating: s.rating,
          reviewDate: dateStr,
          verifiedPurchase: s.verified,
          reviewerName: s.reviewer,
          helpfulVotes: s.helpful,
          dataSourceType: "dataset",
          isPublic: true,
          analysisAttempts: 1,
          lastAnalysisError: null,
          retrievedAt: capturedAt,
        };
        this.reviews.set(revId, rev);
        this.seededReviewIds.add(revId);
        createdReviews.push(rev);
      }

      const siblings = createdReviews.map((r) => ({
        id: r.id,
        text: r.reviewText,
        title: r.reviewTitle,
        rating: r.rating,
        date: r.reviewDate,
      }));

      const prodAnalyses: ReviewAnalysisRecord[] = [];
      for (const [rIdx, rev] of createdReviews.entries()) {
        const s = activeSeeds[rIdx]!;
        const heur = heuristicSignals(
          { id: rev.id, text: rev.reviewText, title: rev.reviewTitle, rating: rev.rating, date: rev.reviewDate },
          siblings,
        );
        const mismatch = ratingMismatch(rev.rating, s.sentiment, s.confidence);
        const combined = combineRisk({
          heuristicRisk: heur.risk,
          geminiRisk: s.geminiRisk,
          ratingMismatch: mismatch,
          signals: heur.signals,
        });
        const analysisRec: ReviewAnalysisRecord = {
          id: deterministicUuid(`analysis:${rev.id}`),
          reviewId: rev.id,
          model: DEFAULT_GEMINI_MODEL,
          promptVersion: PROMPT_VERSION,
          sentiment: s.sentiment,
          sentimentConfidence: s.confidence,
          authenticityRisk: combined.risk,
          authenticityClassification: combined.classification,
          aspects: s.aspects,
          reasoningSignals: s.signals,
          riskBreakdown: combined.breakdown,
          analyzedAt: capturedAt,
        };
        this.analyses.push(analysisRec);
        this.seededAnalysisIds.add(analysisRec.id);
        prodAnalyses.push(analysisRec);
      }

      const agg = computeProductAggregates(
        productId,
        createdReviews.length,
        prodAnalyses,
        DEFAULT_GEMINI_MODEL,
        createdReviews,
      );
      this.productAnalyses.set(productId, { ...agg.analysis, computedAt: capturedAt });
      this.aspects.set(
        productId,
        agg.aspects.map((a) => ({ ...a, productId })),
      );
    }
  }

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
    if (p.verificationLevel === "verified" && !p.identityVerified) {
      throw new Error("verified products need identity_verified");
    }
    if (p.verificationLevel !== "verified" && p.urlVerified) {
      throw new Error("only verified products can have url_verified");
    }
    if (p.urlVerified && (p.urlVerificationStatus !== "verified" || !p.canonicalUrl)) {
      throw new Error("url_verified requires status 'verified' and a canonical URL");
    }
    if (await this.findProduct(p.source, p.externalId)) throw new Error("duplicate product");
    const rec: ProductRecord = { ...p, id: randomUUID() };
    this.products.set(rec.id, rec);
    this.persistCustomStore();
    return rec;
  }
  async insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult> {
    let inserted = 0;
    let dup = 0;
    for (const r of reviews) {
      const product = this.products.get(r.productId);
      if (!product || product.externalId !== r.externalId) {
        throw new Error("review (product_id, external_id) does not match a product");
      }
      if (r.dataSourceType === "user_pasted" && r.isPublic) {
        throw new Error("pasted reviews cannot be public");
      }
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
    if (inserted > 0) this.persistCustomStore();
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
          !this.analyses.some((a) => a.reviewId === r.id && a.promptVersion === promptVersion),
      )
      .slice(0, limit);
  }
  async saveAnalyses(rows: NewReviewAnalysis[]) {
    for (const row of rows) {
      if (!this.reviews.has(row.reviewId)) throw new Error("analysis for unknown review");
      if (row.authenticityRisk < 0 || row.authenticityRisk > 1) throw new Error("authenticity_risk out of range");
      if (row.sentimentConfidence < 0 || row.sentimentConfidence > 1) {
        throw new Error("sentiment_confidence out of range");
      }
      const idx = this.analyses.findIndex(
        (a) => a.reviewId === row.reviewId && a.model === row.model && a.promptVersion === row.promptVersion,
      );
      const rec: ReviewAnalysisRecord = {
        ...row,
        id: idx >= 0 ? this.analyses[idx]!.id : randomUUID(),
        analyzedAt: this.now().toISOString(),
      };
      if (idx >= 0) this.analyses[idx] = rec;
      else this.analyses.push(rec);
    }
    if (rows.length > 0) this.persistCustomStore();
  }
  async markAnalysisFailed(reviewIds: string[], error: string) {
    for (const id of reviewIds) {
      const r = this.reviews.get(id);
      if (r) {
        this.reviews.set(id, {
          ...r,
          analysisAttempts: r.analysisAttempts + 1,
          lastAnalysisError: error.slice(0, 500),
        });
      }
    }
  }
  async analysesForProduct(productId: string, model: string, promptVersion: string) {
    const ids = new Set([...this.reviews.values()].filter((r) => r.productId === productId).map((r) => r.id));
    const exact = this.analyses.filter(
      (a) => ids.has(a.reviewId) && a.model === model && a.promptVersion === promptVersion,
    );
    if (exact.length > 0) return exact;
    return this.analyses.filter((a) => ids.has(a.reviewId) && a.promptVersion === promptVersion);
  }
  async getReviewAnalysis(reviewId: string, model: string, promptVersion: string) {
    return (
      this.analyses.find((a) => a.reviewId === reviewId && a.model === model && a.promptVersion === promptVersion) ??
      this.analyses.find((a) => a.reviewId === reviewId && a.promptVersion === promptVersion) ??
      null
    );
  }

  async saveProductAggregates(
    productId: string,
    analysis: NewProductAnalysis,
    aspects: Omit<ProductAspectRecord, "productId">[],
  ) {
    const sum = analysis.positiveCount + analysis.neutralCount + analysis.negativeCount;
    if (sum !== analysis.reviewsAnalyzed) throw new Error("sentiment counts must add up to reviews_analyzed");
    if (analysis.reviewsAnalyzed > analysis.reviewsTotal) throw new Error("reviews_analyzed > reviews_total");
    for (const a of aspects) {
      if (a.positiveCount + a.neutralCount + a.negativeCount !== a.mentionCount) {
        throw new Error("aspect counts inconsistent");
      }
    }
    this.productAnalyses.set(productId, { ...analysis, productId, computedAt: this.now().toISOString() });
    this.aspects.set(
      productId,
      aspects.map((a) => ({ ...a, productId })),
    );
    this.persistCustomStore();
  }
  async getProductAnalysis(productId: string) {
    return this.productAnalyses.get(productId) ?? null;
  }
  async listProductAspects(productId: string) {
    return this.aspects.get(productId) ?? [];
  }

  async startRun(run: Pick<AnalysisRunRecord, "trigger" | "model" | "promptVersion">) {
    const rec: AnalysisRunRecord = {
      id: randomUUID(),
      startedAt: this.now().toISOString(),
      finishedAt: null,
      ...run,
      status: "running",
      reviewsAttempted: 0,
      reviewsSucceeded: 0,
      reviewsFailed: 0,
      note: null,
    };
    this.runs.set(rec.id, rec);
    return rec;
  }
  async finishRun(
    id: string,
    result: Pick<AnalysisRunRecord, "status" | "reviewsAttempted" | "reviewsSucceeded" | "reviewsFailed" | "note">,
  ) {
    const r = this.runs.get(id);
    if (r) this.runs.set(id, { ...r, ...result, finishedAt: this.now().toISOString() });
  }
}
