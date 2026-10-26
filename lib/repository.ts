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
  publicOnly: boolean;
  limit: number;
  offset: number;
}

export interface Repository {
  findProduct(source: Marketplace, externalId: string): Promise<ProductRecord | null>;
  getProduct(id: string): Promise<ProductRecord | null>;
  listProducts(limit: number, offset: number): Promise<ProductRecord[]>;
  insertProduct(p: NewProduct): Promise<ProductRecord>;

  insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult>;
  listReviews(productId: string, options: ListReviewsOptions): Promise<ReviewRecord[]>;
  getReview(id: string): Promise<ReviewRecord | null>;
  reviewsForProduct(productId: string, max: number): Promise<ReviewRecord[]>;

  pendingReviews(model: string, promptVersion: string, maxAttempts: number, limit: number): Promise<ReviewRecord[]>;
  saveAnalyses(rows: NewReviewAnalysis[]): Promise<void>;
  markAnalysisFailed(reviewIds: string[], error: string): Promise<void>;
  analysesForProduct(productId: string, model: string, promptVersion: string): Promise<ReviewAnalysisRecord[]>;
  getReviewAnalysis(reviewId: string, model: string, promptVersion: string): Promise<ReviewAnalysisRecord | null>;

  saveProductAggregates(
    productId: string,
    analysis: NewProductAnalysis,
    aspects: Omit<ProductAspectRecord, "productId">[],
  ): Promise<void>;
  getProductAnalysis(productId: string): Promise<ProductAnalysisRecord | null>;
  listProductAspects(productId: string): Promise<ProductAspectRecord[]>;

  startRun(run: Pick<AnalysisRunRecord, "trigger" | "model" | "promptVersion">): Promise<AnalysisRunRecord>;
  finishRun(
    id: string,
    result: Pick<AnalysisRunRecord, "status" | "reviewsAttempted" | "reviewsSucceeded" | "reviewsFailed" | "note">,
  ): Promise<void>;
}
