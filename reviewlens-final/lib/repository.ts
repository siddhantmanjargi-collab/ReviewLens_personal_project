import type { NewProduct, NewReview, ProductRecord, ReviewRecord } from "./types";

export interface InsertReviewsResult {
  inserted: number;
  duplicatesInDatabase: number;
}

/** Storage boundary. Services depend on this interface, never on Supabase directly. */
export interface Repository {
  findProductByAsin(asin: string): Promise<ProductRecord | null>;
  getProduct(id: string): Promise<ProductRecord | null>;
  listProducts(limit: number, offset: number): Promise<ProductRecord[]>;
  insertProduct(p: NewProduct): Promise<ProductRecord>;
  insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult>;
  listReviews(productId: string, limit: number, offset: number): Promise<ReviewRecord[]>;
}
