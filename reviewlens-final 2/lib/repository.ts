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

export interface InsertReviewsResult {
  inserted: number;
  duplicatesInDatabase: number;
}

export interface ListReviewsOptions {
  /** true = only reviews that may be shown publicly. */
  publicOnly: boolean;
  limit: number;
  offset: number;
}

/** Storage boundary. Services depend on this interface, never on Supabase directly. */
export interface Repository {
  // products
  findProduct(source: Marketplace, externalId: string): Promise<ProductRecord | null>;
  getProduct(id: string): Promise<ProductRecord | null>;
  listProducts(limit: number, offset: number): Promise<ProductRecord[]>;
  insertProduct(p: NewProduct): Promise<ProductRecord>;

  // reviews
  insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult>;
  listReviews(productId: string, opts: ListReviewsOptions): Promise<ReviewRecord[]>;
  getReview(id: string): Promise<ReviewRecord | null>;
  /** Up to `max` reviews of a product (most recent first). Used for similarity checks and aggregation. */
  reviewsForProduct(productId: string, max: number): Promise<ReviewRecord[]>;

  // analysis
  /** Reviews with no analysis for (model, promptVersion) that have not failed `maxAttempts` times. */
  pendingReviews(model: string, promptVersion: string, maxAttempts: number, limit: number): Promise<ReviewRecord[]>;
  saveAnalyses(rows: NewReviewAnalysis[]): Promise<void>;
  /** Counts one failed attempt against each review and stores the reason. */
  markAnalysisFailed(reviewIds: string[], error: string): Promise<void>;
  analysesForProduct(productId: string, model: string, promptVersion: string): Promise<ReviewAnalysisRecord[]>;
  getReviewAnalysis(reviewId: string, model: string, promptVersion: string): Promise<ReviewAnalysisRecord | null>;

  // aggregates (written atomically: analysis row + aspect rows together)
  saveProductAggregates(
    productId: string,
    analysis: NewProductAnalysis,
    aspects: Omit<ProductAspectRecord, "productId">[],
  ): Promise<void>;
  getProductAnalysis(productId: string): Promise<ProductAnalysisRecord | null>;
  listProductAspects(productId: string): Promise<ProductAspectRecord[]>;

  // run log
  startRun(run: Pick<AnalysisRunRecord, "trigger" | "model" | "promptVersion">): Promise<AnalysisRunRecord>;
  finishRun(
    id: string,
    result: Pick<AnalysisRunRecord, "status" | "reviewsAttempted" | "reviewsSucceeded" | "reviewsFailed" | "note">,
  ): Promise<void>;
}
