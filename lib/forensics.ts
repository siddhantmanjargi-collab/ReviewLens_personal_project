import { jaccard, words } from "./detector";
import type { ProductRecord, ReviewAnalysisRecord, ReviewRecord } from "./types";

export interface SimilarityPair {
  reviewAId: string;
  reviewBId: string;
  reviewerA: string;
  reviewerB: string;
  titleA: string;
  titleB: string;
  jaccardSimilarity: number;
  sharedRating: number;
}

export interface ProductClusterForensics {
  productId: string;
  duplicatePairs: SimilarityPair[];
  dateBursts: { date: string; count: number; avgRisk: number }[];
  crossProductReviewers: {
    reviewerName: string;
    otherProductCount: number;
    otherProducts: { productId: string; productName: string; externalId: string; rating: number; risk: number }[];
  }[];
}

export interface ShillRingCluster {
  reviewerHandle: string;
  reviewCount: number;
  unverifiedCount: number;
  avgRating: number;
  avgRisk: number;
  templateSimilarity: number;
  dateSpanDays: number;
  productsTargeted: {
    productId: string;
    externalId: string;
    productName: string;
    brand: string | null;
    rating: number;
    risk: number;
    reviewTitle: string;
    reviewDate: string | null;
  }[];
}

export interface ProductInflationEntry {
  productId: string;
  externalId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  rawAvgRating: number;
  genuineAvgRating: number;
  inflationDelta: number;
  flaggedCount: number;
  totalReviews: number;
  averageRisk: number;
}

export interface CatalogForensicsSummary {
  totalProductsAudited: number;
  totalReviewsAudited: number;
  flaggedSpamCount: number;
  mismatchCount: number;
  shillRings: ShillRingCluster[];
  inflationLeaderboard: ProductInflationEntry[];
}

function shingles3(text: string): Set<string> {
  const toks = words(text);
  const out = new Set<string>();
  if (toks.length < 3) {
    if (toks.length > 0) out.add(toks.join(" "));
    return out;
  }
  for (let i = 0; i <= toks.length - 3; i++) {
    out.add(toks.slice(i, i + 3).join(" "));
  }
  return out;
}

export function computeProductClusterForensics(params: {
  productId: string;
  productReviews: ReviewRecord[];
  allProducts: ProductRecord[];
  allReviews: ReviewRecord[];
  analysisByReviewId: Map<string, ReviewAnalysisRecord>;
}): ProductClusterForensics {
  const { productId, productReviews, allProducts, allReviews, analysisByReviewId } = params;
  const duplicatePairs: SimilarityPair[] = [];

  // 1. 3-gram Jaccard similarity pairs within product
  const shingleMap = new Map<string, Set<string>>();
  for (const r of productReviews) {
    shingleMap.set(r.id, shingles3(`${r.reviewTitle ?? ""} ${r.reviewText}`));
  }

  for (let i = 0; i < productReviews.length; i++) {
    for (let j = i + 1; j < productReviews.length; j++) {
      const a = productReviews[i]!;
      const b = productReviews[j]!;
      const sim = jaccard(shingleMap.get(a.id)!, shingleMap.get(b.id)!);
      if (sim >= 0.22) {
        duplicatePairs.push({
          reviewAId: a.id,
          reviewBId: b.id,
          reviewerA: a.reviewerName ?? "Anonymous",
          reviewerB: b.reviewerName ?? "Anonymous",
          titleA: a.reviewTitle ?? a.reviewText.slice(0, 48),
          titleB: b.reviewTitle ?? b.reviewText.slice(0, 48),
          jaccardSimilarity: Math.round(sim * 1000) / 1000,
          sharedRating: a.rating,
        });
      }
    }
  }
  duplicatePairs.sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity);

  // 2. Temporal date bursts
  const byDate = new Map<string, { count: number; riskSum: number }>();
  for (const r of productReviews) {
    if (!r.reviewDate) continue;
    const cur = byDate.get(r.reviewDate) ?? { count: 0, riskSum: 0 };
    cur.count += 1;
    cur.riskSum += analysisByReviewId.get(r.id)?.authenticityRisk ?? 0.1;
    byDate.set(r.reviewDate, cur);
  }
  const dateBursts = [...byDate.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([date, v]) => ({
      date,
      count: v.count,
      avgRisk: Math.round((v.riskSum / v.count) * 1000) / 1000,
    }))
    .sort((a, b) => b.count - a.count || b.avgRisk - a.avgRisk);

  // 3. Cross-product reviewer overlap
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const crossProductReviewers: ProductClusterForensics["crossProductReviewers"] = [];
  const seenNames = new Set<string>();

  for (const r of productReviews) {
    const name = (r.reviewerName ?? "").trim();
    if (!name || name === "Verified Shopper" || name === "Shopper" || seenNames.has(name.toLowerCase())) {
      continue;
    }
    seenNames.add(name.toLowerCase());

    const others = allReviews.filter(
      (o) => o.productId !== productId && (o.reviewerName ?? "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (others.length > 0) {
      crossProductReviewers.push({
        reviewerName: name,
        otherProductCount: others.length,
        otherProducts: others.slice(0, 6).map((o) => {
          const prod = productById.get(o.productId);
          return {
            productId: o.productId,
            productName: prod?.productName ?? o.externalId,
            externalId: o.externalId,
            rating: o.rating,
            risk: analysisByReviewId.get(o.id)?.authenticityRisk ?? 0.1,
          };
        }),
      });
    }
  }

  return {
    productId,
    duplicatePairs,
    dateBursts,
    crossProductReviewers,
  };
}

export function computeCatalogShillForensics(params: {
  products: ProductRecord[];
  reviews: ReviewRecord[];
  analyses: ReviewAnalysisRecord[];
}): CatalogForensicsSummary {
  const { products, reviews, analyses } = params;
  const productById = new Map(products.map((p) => [p.id, p]));
  const analysisByReviewId = new Map(analyses.map((a) => [a.reviewId, a]));

  let flaggedSpamCount = 0;
  let mismatchCount = 0;

  for (const r of reviews) {
    const ana = analysisByReviewId.get(r.id);
    const risk = ana?.authenticityRisk ?? 0.1;
    const mis = ana?.riskBreakdown?.ratingMismatch ?? 0;
    if (risk >= 0.33) flaggedSpamCount += 1;
    if (mis >= 0.3) mismatchCount += 1;
  }

  // Group reviews by normalized reviewer handle to find cross-product shill rings
  const byHandle = new Map<string, ReviewRecord[]>();
  for (const r of reviews) {
    const name = (r.reviewerName ?? "").trim();
    if (!name || name === "Verified Shopper" || name === "Shopper") continue;
    const key = name.toLowerCase();
    const arr = byHandle.get(key) ?? [];
    arr.push(r);
    byHandle.set(key, arr);
  }

  const shillRings: ShillRingCluster[] = [];
  for (const [, group] of byHandle) {
    const distinctProducts = new Set(group.map((g) => g.productId));
    if (distinctProducts.size < 2) continue;

    const risks = group.map((g) => analysisByReviewId.get(g.id)?.authenticityRisk ?? 0.1);
    const avgRisk = risks.reduce((s, v) => s + v, 0) / risks.length;
    const unverifiedCount = group.filter((g) => !g.verifiedPurchase).length;

    // Flag accounts with elevated average suspicion or repeated unverified multi-product 5-star bursts
    if (avgRisk < 0.3 && unverifiedCount < 2) continue;

    // Pairwise 3-gram Jaccard template similarity across the reviewer's posts
    let simSum = 0;
    let simPairs = 0;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const sA = shingles3(`${group[i]!.reviewTitle ?? ""} ${group[i]!.reviewText}`);
        const sB = shingles3(`${group[j]!.reviewTitle ?? ""} ${group[j]!.reviewText}`);
        simSum += jaccard(sA, sB);
        simPairs += 1;
      }
    }
    const templateSimilarity = simPairs > 0 ? Math.round((simSum / simPairs) * 1000) / 1000 : 0;

    const timestamps = group
      .map((g) => (g.reviewDate ? Date.parse(g.reviewDate) : NaN))
      .filter((t) => Number.isFinite(t));
    const dateSpanDays =
      timestamps.length >= 2
        ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000)
        : 0;

    shillRings.push({
      reviewerHandle: group[0]!.reviewerName ?? "Unknown",
      reviewCount: group.length,
      unverifiedCount,
      avgRating: Math.round((group.reduce((s, g) => s + g.rating, 0) / group.length) * 100) / 100,
      avgRisk: Math.round(avgRisk * 1000) / 1000,
      templateSimilarity,
      dateSpanDays,
      productsTargeted: group.map((g) => {
        const p = productById.get(g.productId);
        return {
          productId: g.productId,
          externalId: g.externalId,
          productName: p?.productName ?? g.externalId,
          brand: p?.brand ?? null,
          rating: g.rating,
          risk: Math.round((analysisByReviewId.get(g.id)?.authenticityRisk ?? 0.1) * 1000) / 1000,
          reviewTitle: g.reviewTitle ?? "Review",
          reviewDate: g.reviewDate,
        };
      }),
    });
  }
  shillRings.sort((a, b) => b.avgRisk - a.avgRisk || b.reviewCount - a.reviewCount);

  // Compute star-rating inflation delta across all products
  const reviewsByProd = new Map<string, ReviewRecord[]>();
  for (const r of reviews) {
    const arr = reviewsByProd.get(r.productId) ?? [];
    arr.push(r);
    reviewsByProd.set(r.productId, arr);
  }

  const inflationLeaderboard: ProductInflationEntry[] = products.map((p) => {
    const pRevs = reviewsByProd.get(p.id) ?? [];
    let rawSum = 0;
    let cleanSum = 0;
    let cleanCount = 0;
    let flagged = 0;
    let riskSum = 0;

    for (const r of pRevs) {
      rawSum += r.rating;
      const ana = analysisByReviewId.get(r.id);
      const risk = ana?.authenticityRisk ?? 0.1;
      const mis = ana?.riskBreakdown?.ratingMismatch ?? 0;
      riskSum += risk;
      if (risk >= 0.33 || mis >= 0.3) {
        flagged += 1;
      } else {
        cleanSum += r.rating;
        cleanCount += 1;
      }
    }

    const rawAvg = pRevs.length > 0 ? rawSum / pRevs.length : p.rating ?? 0;
    const genAvg = cleanCount > 0 ? cleanSum / cleanCount : rawAvg;
    // Positive inflationDelta means raw rating was artificially higher than genuine buyer consensus
    const inflationDelta = Math.round((rawAvg - genAvg) * 100) / 100;

    return {
      productId: p.id,
      externalId: p.externalId,
      productName: p.productName,
      brand: p.brand,
      category: p.category,
      rawAvgRating: Math.round(rawAvg * 100) / 100,
      genuineAvgRating: Math.round(genAvg * 100) / 100,
      inflationDelta,
      flaggedCount: flagged,
      totalReviews: pRevs.length,
      averageRisk: pRevs.length > 0 ? Math.round((riskSum / pRevs.length) * 1000) / 1000 : 0,
    };
  });

  inflationLeaderboard.sort(
    (a, b) => Math.abs(b.inflationDelta) - Math.abs(a.inflationDelta) || b.averageRisk - a.averageRisk,
  );

  return {
    totalProductsAudited: products.length,
    totalReviewsAudited: reviews.length,
    flaggedSpamCount,
    mismatchCount,
    shillRings,
    inflationLeaderboard,
  };
}
