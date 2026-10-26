import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisRunRecord, Marketplace, NewProduct, NewProductAnalysis, NewReview, NewReviewAnalysis,
  ProductAnalysisRecord, ProductAspectRecord, ProductRecord, ReviewAnalysisRecord, ReviewRecord,
} from "./types";
import type { InsertReviewsResult, ListReviewsOptions, Repository } from "./repository";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function productFromRow(r: Row): ProductRecord {
  return {
    id: r.id, source: r.source, externalId: r.external_id, verificationLevel: r.verification_level,
    productName: r.product_name, brand: r.brand, manufacturer: r.manufacturer, model: r.model,
    category: r.category, deviceType: r.device_type, description: r.description, imageUrl: r.image_url,
    price: num(r.price), mrp: num(r.mrp), discountPercent: num(r.discount_percent), currency: r.currency,
    rating: num(r.rating), reviewCount: r.review_count, availability: r.availability,
    specs: r.specs ?? {}, unavailableFields: r.unavailable_fields ?? [],
    sourceUrl: r.source_url, canonicalUrl: r.canonical_url, urlVerified: r.url_verified,
    urlVerificationStatus: r.url_verification_status, identityVerified: r.identity_verified,
    retrievalStatus: r.retrieval_status, dataSourceType: r.data_source_type, lastCheckedAt: r.last_checked_at,
  };
}

function productToRow(p: NewProduct): Row {
  return {
    source: p.source, external_id: p.externalId, verification_level: p.verificationLevel,
    product_name: p.productName, brand: p.brand, manufacturer: p.manufacturer, model: p.model,
    category: p.category, device_type: p.deviceType, description: p.description, image_url: p.imageUrl,
    price: p.price, mrp: p.mrp, discount_percent: p.discountPercent, currency: p.currency,
    rating: p.rating, review_count: p.reviewCount, availability: p.availability, specs: p.specs,
    unavailable_fields: p.unavailableFields, source_url: p.sourceUrl, canonical_url: p.canonicalUrl,
    url_verified: p.urlVerified, url_verification_status: p.urlVerificationStatus,
    identity_verified: p.identityVerified, retrieval_status: p.retrievalStatus,
    data_source_type: p.dataSourceType, last_checked_at: p.lastCheckedAt,
  };
}

function reviewFromRow(r: Row): ReviewRecord {
  return {
    id: r.id, productId: r.product_id, externalId: r.external_id, source: r.source,
    sourceReviewId: r.source_review_id, contentHash: r.content_hash, reviewTitle: r.review_title,
    reviewText: r.review_text, rating: r.rating, reviewDate: r.review_date,
    verifiedPurchase: r.verified_purchase, reviewerName: r.reviewer_name, helpfulVotes: r.helpful_votes,
    dataSourceType: r.data_source_type, isPublic: r.is_public, analysisAttempts: r.analysis_attempts ?? 0,
    lastAnalysisError: r.last_analysis_error ?? null, retrievedAt: r.retrieved_at,
  };
}

function reviewToRow(r: NewReview): Row {
  return {
    product_id: r.productId, external_id: r.externalId, source: r.source, source_review_id: r.sourceReviewId,
    content_hash: r.contentHash, review_title: r.reviewTitle, review_text: r.reviewText, rating: r.rating,
    review_date: r.reviewDate, verified_purchase: r.verifiedPurchase, reviewer_name: r.reviewerName,
    helpful_votes: r.helpfulVotes, data_source_type: r.dataSourceType, is_public: r.isPublic,
    retrieved_at: r.retrievedAt,
  };
}

function analysisFromRow(r: Row): ReviewAnalysisRecord {
  return {
    id: r.id, reviewId: r.review_id, model: r.model, promptVersion: r.prompt_version, sentiment: r.sentiment,
    sentimentConfidence: Number(r.sentiment_confidence), authenticityRisk: Number(r.authenticity_risk),
    authenticityClassification: r.authenticity_classification, aspects: r.aspects ?? [],
    reasoningSignals: r.reasoning_signals ?? [], riskBreakdown: r.risk_breakdown ?? {}, analyzedAt: r.analyzed_at,
  };
}

const UNIQUE_VIOLATION = "23505";

export class SupabaseRepository implements Repository {
  constructor(private readonly db: SupabaseClient) {}

  private fail(where: string, error: { message: string }): never {
    throw new Error(`${where}: ${error.message}`);
  }

  async findProduct(source: Marketplace, externalId: string) {
    const { data, error } = await this.db.from("products").select("*").eq("source", source).eq("external_id", externalId).maybeSingle();
    if (error) this.fail("findProduct", error);
    return data ? productFromRow(data) : null;
  }

  async getProduct(id: string) {
    const { data, error } = await this.db.from("products").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getProduct", error);
    return data ? productFromRow(data) : null;
  }

  async listProducts(limit: number, offset: number) {
    const { data, error } = await this.db.from("products").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) this.fail("listProducts", error);
    return (data ?? []).map(productFromRow);
  }

  async insertProduct(p: NewProduct) {
    const { data, error } = await this.db.from("products").insert(productToRow(p)).select("*").single();
    if (error) this.fail("insertProduct", error);
    return productFromRow(data);
  }

  async insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult> {
    if (reviews.length === 0) return { inserted: 0, duplicatesInDatabase: 0 };
    const productId = reviews[0]!.productId;
    const { data: existing, error: exErr } = await this.db.from("reviews").select("content_hash, source_review_id").eq("product_id", productId);
    if (exErr) this.fail("insertReviews(lookup)", exErr);
    const hashes = new Set((existing ?? []).map((e: Row) => e.content_hash));
    const sids = new Set((existing ?? []).map((e: Row) => e.source_review_id).filter(Boolean));
    const fresh = reviews.filter((r) => !hashes.has(r.contentHash) && !(r.sourceReviewId !== null && sids.has(r.sourceReviewId)));
    let duplicates = reviews.length - fresh.length;
    if (fresh.length === 0) return { inserted: 0, duplicatesInDatabase: duplicates };

    const { error } = await this.db.from("reviews").insert(fresh.map(reviewToRow));
    if (!error) return { inserted: fresh.length, duplicatesInDatabase: duplicates };
    if (error.code !== UNIQUE_VIOLATION) this.fail("insertReviews", error);

    let inserted = 0;
    for (const r of fresh) {
      const { error: e } = await this.db.from("reviews").insert(reviewToRow(r));
      if (!e) inserted += 1;
      else if (e.code === UNIQUE_VIOLATION) duplicates += 1;
      else this.fail("insertReviews(row)", e);
    }
    return { inserted, duplicatesInDatabase: duplicates };
  }

  async listReviews(productId: string, o: ListReviewsOptions) {
    let q = this.db.from("reviews").select("*").eq("product_id", productId);
    if (o.publicOnly) q = q.eq("is_public", true);
    const { data, error } = await q.order("review_date", { ascending: false, nullsFirst: false }).range(o.offset, o.offset + o.limit - 1);
    if (error) this.fail("listReviews", error);
    return (data ?? []).map(reviewFromRow);
  }

  async getReview(id: string) {
    const { data, error } = await this.db.from("reviews").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getReview", error);
    return data ? reviewFromRow(data) : null;
  }

  async reviewsForProduct(productId: string, max: number) {
    const { data, error } = await this.db.from("reviews").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(max);
    if (error) this.fail("reviewsForProduct", error);
    return (data ?? []).map(reviewFromRow);
  }

  async pendingReviews(model: string, promptVersion: string, maxAttempts: number, limit: number) {
    const { data, error } = await this.db.rpc("reviews_needing_analysis", {
      p_model: model, p_prompt: promptVersion, p_max_attempts: maxAttempts, p_limit: limit,
    });
    if (error) this.fail("pendingReviews", error);
    return ((data ?? []) as Row[]).map(reviewFromRow);
  }

  async saveAnalyses(rows: NewReviewAnalysis[]) {
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      review_id: r.reviewId, model: r.model, prompt_version: r.promptVersion, sentiment: r.sentiment,
      sentiment_confidence: r.sentimentConfidence, authenticity_risk: r.authenticityRisk,
      authenticity_classification: r.authenticityClassification, aspects: r.aspects,
      reasoning_signals: r.reasoningSignals, risk_breakdown: r.riskBreakdown, analyzed_at: new Date().toISOString(),
    }));
    const { error } = await this.db.from("review_analysis").upsert(payload, { onConflict: "review_id,model,prompt_version" });
    if (error) this.fail("saveAnalyses", error);
  }

  async markAnalysisFailed(reviewIds: string[], error: string) {
    if (reviewIds.length === 0) return;
    const { error: e } = await this.db.rpc("mark_review_analysis_failed", { p_ids: reviewIds, p_error: error });
    if (e) this.fail("markAnalysisFailed", e);
  }

  async analysesForProduct(productId: string, model: string, promptVersion: string) {
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from("reviews").select("id").eq("product_id", productId).range(from, from + 999);
      if (error) this.fail("analysesForProduct(ids)", error);
      ids.push(...(data ?? []).map((r: Row) => r.id));
      if (!data || data.length < 1000) break;
    }
    const out: ReviewAnalysisRecord[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await this.db.from("review_analysis").select("*").eq("model", model).eq("prompt_version", promptVersion).in("review_id", ids.slice(i, i + 200));
      if (error) this.fail("analysesForProduct", error);
      out.push(...(data ?? []).map(analysisFromRow));
    }
    return out;
  }

  async getReviewAnalysis(reviewId: string, model: string, promptVersion: string) {
    const { data, error } = await this.db.from("review_analysis").select("*").eq("review_id", reviewId).eq("model", model).eq("prompt_version", promptVersion).maybeSingle();
    if (error) this.fail("getReviewAnalysis", error);
    return data ? analysisFromRow(data) : null;
  }

  async saveProductAggregates(productId: string, a: NewProductAnalysis, aspects: Omit<ProductAspectRecord, "productId">[]) {
    const { error } = await this.db.rpc("save_product_aggregates", {
      p_product_id: productId,
      p_analysis: {
        reviews_total: a.reviewsTotal, reviews_analyzed: a.reviewsAnalyzed, positive_count: a.positiveCount,
        neutral_count: a.neutralCount, negative_count: a.negativeCount, avg_sentiment_confidence: a.avgSentimentConfidence,
        authenticity_distribution: a.authenticityDistribution, details: a.details, model: a.model,
      },
      p_aspects: aspects.map((x) => ({
        aspect_name: x.aspectName, mention_count: x.mentionCount, positive_count: x.positiveCount,
        neutral_count: x.neutralCount, negative_count: x.negativeCount,
      })),
    });
    if (error) this.fail("saveProductAggregates", error);
  }

  async getProductAnalysis(productId: string): Promise<ProductAnalysisRecord | null> {
    const { data, error } = await this.db.from("product_analysis").select("*").eq("product_id", productId).maybeSingle();
    if (error) this.fail("getProductAnalysis", error);
    if (!data) return null;
    return {
      productId: data.product_id, reviewsTotal: data.reviews_total, reviewsAnalyzed: data.reviews_analyzed,
      positiveCount: data.positive_count, neutralCount: data.neutral_count, negativeCount: data.negative_count,
      avgSentimentConfidence: num(data.avg_sentiment_confidence), authenticityDistribution: data.authenticity_distribution ?? {},
      details: data.details ?? {}, model: data.model, computedAt: data.computed_at,
    };
  }

  async listProductAspects(productId: string): Promise<ProductAspectRecord[]> {
    const { data, error } = await this.db.from("product_aspects").select("*").eq("product_id", productId).order("mention_count", { ascending: false });
    if (error) this.fail("listProductAspects", error);
    return (data ?? []).map((r: Row) => ({
      productId: r.product_id, aspectName: r.aspect_name, mentionCount: r.mention_count,
      positiveCount: r.positive_count, neutralCount: r.neutralCount, negativeCount: r.negative_count,
    }));
  }

  async startRun(run: Pick<AnalysisRunRecord, "trigger" | "model" | "promptVersion">): Promise<AnalysisRunRecord> {
    const { data, error } = await this.db.from("analysis_runs").insert({ trigger: run.trigger, model: run.model, prompt_version: run.promptVersion }).select("*").single();
    if (error) this.fail("startRun", error);
    return {
      id: data.id, startedAt: data.started_at, finishedAt: null, trigger: data.trigger, model: data.model,
      promptVersion: data.prompt_version, status: "running", reviewsAttempted: 0, reviewsSucceeded: 0, reviewsFailed: 0, note: null,
    };
  }

  async finishRun(id: string, r: Pick<AnalysisRunRecord, "status" | "reviewsAttempted" | "reviewsSucceeded" | "reviewsFailed" | "note">) {
    const { error } = await this.db.from("analysis_runs").update({
      status: r.status, reviews_attempted: r.reviewsAttempted, reviews_succeeded: r.reviewsSucceeded,
      reviews_failed: r.reviewsFailed, note: r.note, finished_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) this.fail("finishRun", error);
  }
}
