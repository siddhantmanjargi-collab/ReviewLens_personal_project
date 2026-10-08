export type UrlVerificationStatus =
  | "verified"
  | "failed"
  | "unavailable"
  | "redirected"
  | "blocked"
  | "not_checked";

export type RetrievalStatus = "live" | "recent" | "cached" | "failed" | "unavailable";

export type DataSourceType =
  | "live_retrieval"
  | "cached"
  | "dataset"
  | "authorized_api"
  | "manual_import";

/** What the caller claims about a product. Never trusted until verified. */
export interface ProductClaim {
  url: string;
  productName: string;
  brand?: string | null;
  model?: string | null;
}

/** Independent evidence about a product, from a live page, authorized API or approved dataset. */
export interface ProductEvidence {
  status: "ok" | "blocked" | "unavailable" | "not_checked" | "error";
  retrievalStatus: RetrievalStatus;
  dataSourceType: DataSourceType;
  retrievedAt: string; // ISO timestamp
  /** URL after redirects, if the source followed any. */
  finalUrl?: string | null;
  canonicalUrl?: string | null;
  asin?: string | null;
  title?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
  deviceType?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  mrp?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  availability?: string | null;
  specs?: Record<string, string | number | boolean> | null;
}

export interface ProductEvidenceSource {
  /** Must never throw for expected failures; return a status instead. */
  retrieve(candidateUrl: string, asin: string): Promise<ProductEvidence>;
}

export interface VerificationResult {
  asin: string | null;
  urlStatus: UrlVerificationStatus;
  urlVerified: boolean;
  identityVerified: boolean;
  canonicalUrl: string | null;
  retrievalStatus: RetrievalStatus;
  dataSourceType: DataSourceType;
  checkedAt: string;
  reasons: string[];
  evidence: ProductEvidence | null;
}

export interface ProductRecord {
  id: string;
  source: "amazon.in";
  asin: string;
  productName: string;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  deviceType: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  mrp: number | null;
  discountPercent: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  specs: Record<string, string | number | boolean>;
  unavailableFields: string[];
  sourceUrl: string | null;
  canonicalUrl: string | null;
  urlVerified: boolean;
  urlVerificationStatus: UrlVerificationStatus;
  identityVerified: boolean;
  retrievalStatus: RetrievalStatus;
  dataSourceType: DataSourceType;
  lastCheckedAt: string | null;
}

export type NewProduct = Omit<ProductRecord, "id">;

export interface ReviewRecord {
  id: string;
  productId: string;
  asin: string;
  source: "amazon.in";
  sourceReviewId: string | null;
  contentHash: string;
  reviewTitle: string | null;
  reviewText: string;
  rating: number;
  reviewDate: string | null; // YYYY-MM-DD
  verifiedPurchase: boolean | null;
  reviewerName: string | null;
  helpfulVotes: number | null;
  dataSourceType: DataSourceType;
  retrievedAt: string;
}

export type NewReview = Omit<ReviewRecord, "id">;
