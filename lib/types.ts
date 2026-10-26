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
  | "manual_import"
  | "user_supplied"
  | "user_pasted"
  | "site_user";

export type Marketplace = "amazon.in" | "flipkart";

export type VerificationLevel = "verified" | "ai_grounded" | "link_only";

export interface ProductClaim {
  url: string;
  productName: string;
  brand?: string | null;
  model?: string | null;
}

export interface ProductEvidence {
  status: "ok" | "blocked" | "unavailable" | "not_checked" | "error";
  retrievalStatus: RetrievalStatus;
  dataSourceType: DataSourceType;
  retrievedAt: string;
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
  source: Marketplace;
  externalId: string;
  verificationLevel: VerificationLevel;
  productName: string;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  deviceType: string | null;
  description: string | null;
  imageUrl: string | null;
  remoteImageUrl?: string | null;
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
  officialUrl?: string | null;
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
  externalId: string;
  source: Marketplace;
  sourceReviewId: string | null;
  contentHash: string;
  reviewTitle: string | null;
  reviewText: string;
  rating: number;
  reviewDate: string | null;
  verifiedPurchase: boolean | null;
  reviewerName: string | null;
  helpfulVotes: number | null;
  dataSourceType: DataSourceType;
  isPublic: boolean;
  analysisAttempts: number;
  lastAnalysisError: string | null;
  retrievedAt: string;
}

export type NewReview = Omit<ReviewRecord, "id" | "analysisAttempts" | "lastAnalysisError">;

export type Sentiment = "positive" | "neutral" | "negative";
export type AuthenticityClass = "low_suspicion" | "moderate_suspicion" | "highly_suspicious";

export interface AspectResult {
  name: string;
  sentiment: Sentiment;
  confidence: number;
}

export interface HeuristicSignal {
  name: string;
  applicable: boolean;
  strength: number;
  weight: number;
  detail: string;
}

export interface RiskBreakdown {
  heuristicRisk: number;
  geminiRisk: number;
  ratingMismatch: number;
  weights: { heuristic: number; gemini: number; mismatch: number };
  signals: HeuristicSignal[];
}

export interface ReviewAnalysisRecord {
  id: string;
  reviewId: string;
  model: string;
  promptVersion: string;
  sentiment: Sentiment;
  sentimentConfidence: number;
  authenticityRisk: number;
  authenticityClassification: AuthenticityClass;
  aspects: AspectResult[];
  reasoningSignals: string[];
  riskBreakdown: RiskBreakdown;
  analyzedAt: string;
}

export type NewReviewAnalysis = Omit<ReviewAnalysisRecord, "id" | "analyzedAt">;

export interface ProductAnalysisRecord {
  productId: string;
  reviewsTotal: number;
  reviewsAnalyzed: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  avgSentimentConfidence: number | null;
  authenticityDistribution: Record<string, number>;
  details: Record<string, unknown>;
  model: string | null;
  computedAt: string;
}

export type NewProductAnalysis = Omit<ProductAnalysisRecord, "computedAt">;

export interface ProductAspectRecord {
  productId: string;
  aspectName: string;
  mentionCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

export interface AnalysisRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: "cron" | "manual";
  model: string;
  promptVersion: string;
  status: "running" | "completed" | "partial" | "failed";
  reviewsAttempted: number;
  reviewsSucceeded: number;
  reviewsFailed: number;
  note: string | null;
}
