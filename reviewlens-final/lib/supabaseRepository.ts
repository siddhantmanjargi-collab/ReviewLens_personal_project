import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewProduct, NewReview, ProductRecord, ReviewRecord } from "./types";
import type { InsertReviewsResult, Repository } from "./repository";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function productFromRow(r: Row): ProductRecord {
  return {
    id: r.id,
    source: r.source,
    asin: r.asin,
    productName: r.product_name,
    brand: r.brand,
    manufacturer: r.manufacturer,
    model: r.model,
    category: r.category,
    deviceType: r.device_type,
    description: r.description,
    imageUrl: r.image_url,
    price: r.price === null ? null : Number(r.price),
    mrp: r.mrp === null ? null : Number(r.mrp),
    discountPercent: r.discount_percent === null ? null : Number(r.discount_percent),
    currency: r.currency,
    rating: r.rating === null ? null : Number(r.rating),
    reviewCount: r.review_count,
    availability: r.availability,
    specs: r.specs ?? {},
    unavailableFields: r.unavailable_fields ?? [],
    sourceUrl: r.source_url,
    canonicalUrl: r.canonical_url,
    urlVerified: r.url_verified,
    urlVerificationStatus: r.url_verification_status,
    identityVerified: r.identity_verified,
    retrievalStatus: r.retrieval_status,
    dataSourceType: r.data_source_type,
    lastCheckedAt: r.last_checked_at,
  };
}

function productToRow(p: NewProduct): Row {
  return {
    source: p.source,
    asin: p.asin,
    product_name: p.productName,
    brand: p.brand,
    manufacturer: p.manufacturer,
    model: p.model,
    category: p.category,
    device_type: p.deviceType,
    description: p.description,
    image_url: p.imageUrl,
    price: p.price,
    mrp: p.mrp,
    discount_percent: p.discountPercent,
    currency: p.currency,
    rating: p.rating,
    review_count: p.reviewCount,
    availability: p.availability,
    specs: p.specs,
    unavailable_fields: p.unavailableFields,
    source_url: p.sourceUrl,
    canonical_url: p.canonicalUrl,
    url_verified: p.urlVerified,
    url_verification_status: p.urlVerificationStatus,
    identity_verified: p.identityVerified,
    retrieval_status: p.retrievalStatus,
    data_source_type: p.dataSourceType,
    last_checked_at: p.lastCheckedAt,
  };
}

function reviewFromRow(r: Row): ReviewRecord {
  return {
    id: r.id,
    productId: r.product_id,
    asin: r.asin,
    source: r.source,
    sourceReviewId: r.source_review_id,
    contentHash: r.content_hash,
    reviewTitle: r.review_title,
    reviewText: r.review_text,
    rating: r.rating,
    reviewDate: r.review_date,
    verifiedPurchase: r.verified_purchase,
    reviewerName: r.reviewer_name,
    helpfulVotes: r.helpful_votes,
    dataSourceType: r.data_source_type,
    retrievedAt: r.retrieved_at,
  };
}

function reviewToRow(r: NewReview): Row {
  return {
    product_id: r.productId,
    asin: r.asin,
    source: r.source,
    source_review_id: r.sourceReviewId,
    content_hash: r.contentHash,
    review_title: r.reviewTitle,
    review_text: r.reviewText,
    rating: r.rating,
    review_date: r.reviewDate,
    verified_purchase: r.verifiedPurchase,
    reviewer_name: r.reviewerName,
    helpful_votes: r.helpfulVotes,
    data_source_type: r.dataSourceType,
    retrieved_at: r.retrievedAt,
  };
}

const UNIQUE_VIOLATION = "23505";

export class SupabaseRepository implements Repository {
  constructor(private readonly db: SupabaseClient) {}

  async findProductByAsin(asin: string) {
    const { data, error } = await this.db.from("products").select("*").eq("source", "amazon.in").eq("asin", asin).maybeSingle();
    if (error) throw new Error(`findProductByAsin: ${error.message}`);
    return data ? productFromRow(data) : null;
  }

  async getProduct(id: string) {
    const { data, error } = await this.db.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getProduct: ${error.message}`);
    return data ? productFromRow(data) : null;
  }

  async listProducts(limit: number, offset: number) {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`listProducts: ${error.message}`);
    return (data ?? []).map(productFromRow);
  }

  async insertProduct(p: NewProduct) {
    const { data, error } = await this.db.from("products").insert(productToRow(p)).select("*").single();
    if (error) throw new Error(`insertProduct: ${error.message}`);
    return productFromRow(data);
  }

  async insertReviews(reviews: NewReview[]): Promise<InsertReviewsResult> {
    if (reviews.length === 0) return { inserted: 0, duplicatesInDatabase: 0 };
    const productId = reviews[0]!.productId;

    // Pre-filter against what is already stored so one duplicate cannot fail the whole batch.
    const { data: existing, error: exErr } = await this.db
      .from("reviews")
      .select("content_hash, source_review_id")
      .eq("product_id", productId);
    if (exErr) throw new Error(`insertReviews(lookup): ${exErr.message}`);
    const hashes = new Set((existing ?? []).map((e: Row) => e.content_hash));
    const sids = new Set((existing ?? []).map((e: Row) => e.source_review_id).filter(Boolean));
    const fresh = reviews.filter(
      (r) => !hashes.has(r.contentHash) && !(r.sourceReviewId !== null && sids.has(r.sourceReviewId)),
    );
    let duplicates = reviews.length - fresh.length;
    if (fresh.length === 0) return { inserted: 0, duplicatesInDatabase: duplicates };

    const { error } = await this.db.from("reviews").insert(fresh.map(reviewToRow));
    if (!error) return { inserted: fresh.length, duplicatesInDatabase: duplicates };
    if (error.code !== UNIQUE_VIOLATION) throw new Error(`insertReviews: ${error.message}`);

    // Race with a concurrent import: fall back to row-by-row so only the true duplicates are skipped.
    let inserted = 0;
    for (const r of fresh) {
      const { error: e } = await this.db.from("reviews").insert(reviewToRow(r));
      if (!e) inserted += 1;
      else if (e.code === UNIQUE_VIOLATION) duplicates += 1;
      else throw new Error(`insertReviews(row): ${e.message}`);
    }
    return { inserted, duplicatesInDatabase: duplicates };
  }

  async listReviews(productId: string, limit: number, offset: number) {
    const { data, error } = await this.db
      .from("reviews")
      .select("*")
      .eq("product_id", productId)
      .order("review_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`listReviews: ${error.message}`);
    return (data ?? []).map(reviewFromRow);
  }
}
