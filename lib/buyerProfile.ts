import type { ProductRecord } from "./types";

export interface ProfileCatalogSnapshot {
  reviewsAnalyzed?: number;
  details?: {
    averageRisk?: number;
    rawAverageRating?: number;
    genuineAverageRating?: number;
    ratingDelta?: number;
  };
  aspects?: {
    aspectName: string;
    mentionCount: number;
    positivePercent: number;
    negativePercent: number;
  }[];
}

export interface ProfileCatalogEntry {
  product: ProductRecord;
  snapshot: ProfileCatalogSnapshot | null;
}

export interface CategoryAffinityItem {
  category: string;
  shortlistCount: number;
  compareCount: number;
  weightPoints: number;
  sharePercent: number;
  muted: boolean;
}

export interface BrandAffinityItem {
  brand: string;
  itemCount: number;
  weightPoints: number;
  sharePercent: number;
  avgGenuinePercent: number;
}

export interface BudgetSweetSpot {
  minInr: number;
  p25Inr: number;
  medianInr: number;
  p75Inr: number;
  maxInr: number;
  bracketId: "all" | "under_2500" | "2500_10000" | "10000_35000" | "over_35000";
  bracketLabel: string;
}

export interface TrustAndDealProfile {
  avgGenuinePercent: number;
  minGenuinePercent: number;
  avgRiskDecimal: number;
  avgDiscountPercent: number;
  trustStandardLabel: string;
  dealSensitivityLabel: string;
}

export interface WatchlistAlertItem {
  productId: string;
  productName: string;
  brand: string;
  category: string;
  priceInr: number | null;
  alertType: "suspicion_watch" | "verified_deal";
  headline: string;
  detail: string;
}

export interface RecommendedCatalogItem {
  entry: ProfileCatalogEntry;
  matchScore: number;
  matchReasons: string[];
}

export interface ComputedBuyerProfile {
  hasSignals: boolean;
  shortlistCount: number;
  compareCount: number;
  uniqueItemCount: number;
  personaTitle: string;
  personaSubtitle: string;
  categoryAffinities: CategoryAffinityItem[];
  brandAffinities: BrandAffinityItem[];
  budget: BudgetSweetSpot | null;
  trust: TrustAndDealProfile | null;
  watchlistAlerts: WatchlistAlertItem[];
  recommendations: RecommendedCatalogItem[];
}

export interface BuyerProfileInputs {
  shortlistIds: string[];
  compareIds: string[];
  mutedCategories?: string[];
  strictTrustMode?: boolean;
  favoriteTimestamps?: Record<string, string>;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return Math.round(sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac);
}

function getGenuinePercent(snapshot: ProfileCatalogSnapshot | null): number {
  const risk = snapshot?.details?.averageRisk ?? 0.14;
  return Math.max(0, Math.min(100, Math.round((1 - risk) * 100)));
}

function formatShortInr(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (amount >= 1000) {
    return `₹${Math.round(amount / 1000)}k`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

function mapMedianToBracket(median: number): {
  bracketId: BudgetSweetSpot["bracketId"];
  bracketLabel: string;
} {
  if (median < 2500) {
    return { bracketId: "under_2500", bracketLabel: "Under ₹2,500" };
  }
  if (median <= 10000) {
    return { bracketId: "2500_10000", bracketLabel: "₹2,500 – ₹10,000" };
  }
  if (median <= 35000) {
    return { bracketId: "10000_35000", bracketLabel: "₹10,000 – ₹35,000" };
  }
  return { bracketId: "over_35000", bracketLabel: "Over ₹35,000" };
}

/**
 * Computes a deterministic Buyer DNA Profile from the user's relational favourites
 * (`shortlist` weighted 3 pts, `compare` weighted 2 pts) and catalog items.
 */
export function computeBuyerProfile<T extends ProfileCatalogEntry>(
  catalog: T[],
  inputs: BuyerProfileInputs,
): ComputedBuyerProfile & { recommendations: { entry: T; matchScore: number; matchReasons: string[] }[] } {
  const shortlistSet = new Set(inputs.shortlistIds);
  const compareSet = new Set(inputs.compareIds);
  const mutedSet = new Set(inputs.mutedCategories ?? []);
  const strictTrustMode = Boolean(inputs.strictTrustMode);

  const byId = new Map<string, T>();
  for (const item of catalog) {
    byId.set(item.product.id, item);
  }

  const allSignalIds = new Set<string>([...shortlistSet, ...compareSet]);
  const signalEntries: { entry: T; weight: number; inShortlist: boolean; inCompare: boolean }[] = [];

  for (const id of allSignalIds) {
    const found = byId.get(id);
    if (!found) continue;
    const inShortlist = shortlistSet.has(id);
    const inCompare = compareSet.has(id);
    const weight = (inShortlist ? 3 : 0) + (inCompare ? 2 : 0);
    signalEntries.push({ entry: found, weight, inShortlist, inCompare });
  }

  if (signalEntries.length === 0) {
    return {
      hasSignals: false,
      shortlistCount: 0,
      compareCount: 0,
      uniqueItemCount: 0,
      personaTitle: "New Hardware Researcher",
      personaSubtitle:
        "Save products with the heart icon or add up to 4 items to Compare to build your automatic Buyer Profile and personalized rankings.",
      categoryAffinities: [],
      brandAffinities: [],
      budget: null,
      trust: null,
      watchlistAlerts: [],
      recommendations: [],
    };
  }

  // 1. Category Affinities
  const catMap = new Map<
    string,
    { shortlistCount: number; compareCount: number; weightPoints: number }
  >();
  let totalCategoryWeight = 0;

  for (const { entry, weight, inShortlist, inCompare } of signalEntries) {
    const cat = entry.product.category ?? "Electronics";
    const cur = catMap.get(cat) ?? { shortlistCount: 0, compareCount: 0, weightPoints: 0 };
    if (inShortlist) cur.shortlistCount += 1;
    if (inCompare) cur.compareCount += 1;
    cur.weightPoints += weight;
    catMap.set(cat, cur);
    totalCategoryWeight += weight;
  }

  const categoryAffinities: CategoryAffinityItem[] = [...catMap.entries()]
    .map(([category, stats]) => ({
      category,
      shortlistCount: stats.shortlistCount,
      compareCount: stats.compareCount,
      weightPoints: stats.weightPoints,
      sharePercent:
        totalCategoryWeight > 0 ? Math.round((stats.weightPoints / totalCategoryWeight) * 100) : 0,
      muted: mutedSet.has(category),
    }))
    .sort((a, b) => b.weightPoints - a.weightPoints || a.category.localeCompare(b.category));

  // 2. Brand Affinities
  const brandMap = new Map<
    string,
    { itemCount: number; weightPoints: number; genuineSum: number }
  >();
  let totalBrandWeight = 0;

  for (const { entry, weight } of signalEntries) {
    const brand = entry.product.brand;
    if (!brand) continue;
    const genuine = getGenuinePercent(entry.snapshot);
    const cur = brandMap.get(brand) ?? { itemCount: 0, weightPoints: 0, genuineSum: 0 };
    cur.itemCount += 1;
    cur.weightPoints += weight;
    cur.genuineSum += genuine;
    brandMap.set(brand, cur);
    totalBrandWeight += weight;
  }

  const brandAffinities: BrandAffinityItem[] = [...brandMap.entries()]
    .map(([brand, stats]) => ({
      brand,
      itemCount: stats.itemCount,
      weightPoints: stats.weightPoints,
      sharePercent:
        totalBrandWeight > 0 ? Math.round((stats.weightPoints / totalBrandWeight) * 100) : 0,
      avgGenuinePercent: Math.round(stats.genuineSum / Math.max(1, stats.itemCount)),
    }))
    .sort((a, b) => b.weightPoints - a.weightPoints || a.brand.localeCompare(b.brand));

  // 3. INR Price Budget Sweet Spot
  const prices = signalEntries
    .map((s) => s.entry.product.price)
    .filter((p): p is number => typeof p === "number" && p > 0)
    .sort((a, b) => a - b);

  let budget: BudgetSweetSpot | null = null;
  if (prices.length > 0) {
    const medianInr = percentile(prices, 0.5);
    const { bracketId, bracketLabel } = mapMedianToBracket(medianInr);
    budget = {
      minInr: prices[0]!,
      p25Inr: percentile(prices, 0.25),
      medianInr,
      p75Inr: percentile(prices, 0.75),
      maxInr: prices[prices.length - 1]!,
      bracketId,
      bracketLabel,
    };
  }

  // 4. Authenticity & Deal Profile
  let genuineWeightedSum = 0;
  let riskWeightedSum = 0;
  let discountWeightedSum = 0;
  let totalWeight = 0;
  let minGenuinePercent = 100;

  for (const { entry, weight } of signalEntries) {
    const risk = entry.snapshot?.details?.averageRisk ?? 0.14;
    const genuine = getGenuinePercent(entry.snapshot);
    const discount = entry.product.discountPercent ?? 0;

    genuineWeightedSum += genuine * weight;
    riskWeightedSum += risk * weight;
    discountWeightedSum += discount * weight;
    totalWeight += weight;
    if (genuine < minGenuinePercent) minGenuinePercent = genuine;
  }

  const avgGenuinePercent = Math.round(genuineWeightedSum / Math.max(1, totalWeight));
  const avgRiskDecimal = Math.round((riskWeightedSum / Math.max(1, totalWeight)) * 100) / 100;
  const avgDiscountPercent = Math.round(discountWeightedSum / Math.max(1, totalWeight));

  const trustStandardLabel =
    strictTrustMode || avgGenuinePercent >= 88
      ? "High-Trust Standard (≥88% Genuine)"
      : avgGenuinePercent >= 80
        ? "Balanced Verification (≥80% Genuine)"
        : "Exploratory Watchlist (Mixed Risk)";

  const dealSensitivityLabel =
    avgDiscountPercent >= 28
      ? `Deal-Driven (${avgDiscountPercent}% avg off MRP)`
      : avgDiscountPercent >= 15
        ? `Moderate Savings (${avgDiscountPercent}% avg off MRP)`
        : `Launch / Flagship Pricing (${avgDiscountPercent}% avg off MRP)`;

  const trust: TrustAndDealProfile = {
    avgGenuinePercent,
    minGenuinePercent,
    avgRiskDecimal,
    avgDiscountPercent,
    trustStandardLabel,
    dealSensitivityLabel,
  };

  // 5. Persona Classification (grounded strictly in actual saved items)
  const topCat = categoryAffinities.find((c) => !c.muted)?.category ?? categoryAffinities[0]?.category ?? "Hardware";
  const secondCat = categoryAffinities.filter((c) => !c.muted)[1]?.category;
  const medianPrice = budget?.medianInr ?? 0;

  let personaTitle = `${topCat} Buyer Profile`;
  if (medianPrice >= 35000 && avgGenuinePercent >= 86) {
    personaTitle = `High-Trust Flagship ${topCat} Specialist`;
  } else if (avgDiscountPercent >= 25 && avgGenuinePercent >= 82) {
    personaTitle = `Verified Value & Deal Analyst`;
  } else if (categoryAffinities.length >= 3) {
    personaTitle = `Cross-Department Hardware Researcher`;
  } else if (avgGenuinePercent >= 88) {
    personaTitle = `Authenticity-First ${topCat} Buyer`;
  }

  const catSummary = secondCat ? `${topCat} and ${secondCat}` : topCat;
  const priceSummary = budget
    ? `a typical ${formatShortInr(budget.p25Inr)}–${formatShortInr(budget.p75Inr)} budget`
    : "verified marketplace listings";
  const personaSubtitle = `Derived from ${signalEntries.length} saved/compared ${
    signalEntries.length === 1 ? "item" : "items"
  } — prioritizing ${catSummary} around ${priceSummary} with ${avgGenuinePercent}% average review authenticity.`;

  // 6. Watchlist Risk & Verified Deal Alerts on saved items
  const watchlistAlerts: WatchlistAlertItem[] = [];
  for (const { entry } of signalEntries) {
    const p = entry.product;
    const risk = entry.snapshot?.details?.averageRisk ?? 0.14;
    const genuine = getGenuinePercent(entry.snapshot);
    const discount = p.discountPercent ?? 0;

    if (risk >= 0.25) {
      watchlistAlerts.push({
        productId: p.id,
        productName: p.productName,
        brand: p.brand ?? "Marketplace",
        category: p.category ?? "Electronics",
        priceInr: p.price,
        alertType: "suspicion_watch",
        headline: `Elevated review suspicion (${Math.round(risk * 100)}% risk)`,
        detail: `Only ${genuine}% of sampled reviews match genuine buyer patterns — inspect segregated reviews before buying.`,
      });
    } else if (discount >= 22 && genuine >= 85) {
      watchlistAlerts.push({
        productId: p.id,
        productName: p.productName,
        brand: p.brand ?? "Marketplace",
        category: p.category ?? "Electronics",
        priceInr: p.price,
        alertType: "verified_deal",
        headline: `${Math.round(discount)}% off MRP with ${genuine}% genuine reviews`,
        detail: `Strong discount backed by clean verified-purchase sentiment on ${p.source}.`,
      });
    }
  }

  // 7. Score unsaved catalog items for "Matched to Your Favourites"
  const activeCatShares = new Map<string, number>();
  for (const c of categoryAffinities) {
    if (!c.muted) activeCatShares.set(c.category, c.sharePercent);
  }
  const brandShares = new Map<string, number>();
  for (const b of brandAffinities) {
    brandShares.set(b.brand, b.sharePercent);
  }

  const recommendations: { entry: T; matchScore: number; matchReasons: string[] }[] = [];

  for (const item of catalog) {
    if (allSignalIds.has(item.product.id)) continue;
    const cat = item.product.category ?? "Electronics";
    if (mutedSet.has(cat)) continue;

    const genuine = getGenuinePercent(item.snapshot);
    const risk = item.snapshot?.details?.averageRisk ?? 0.14;
    if (strictTrustMode && genuine < 85) continue;
    if (risk >= 0.33) continue; // Never recommend high-suspicion products

    const scored = scoreCatalogEntryAgainstProfile(item, {
      activeCatShares,
      brandShares,
      budget,
      avgDiscountPercent,
      strictTrustMode,
    });

    if (scored.score >= 32) {
      recommendations.push({
        entry: item,
        matchScore: scored.score,
        matchReasons: scored.reasons,
      });
    }
  }

  recommendations.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      (b.entry.product.rating ?? 0) - (a.entry.product.rating ?? 0),
  );

  return {
    hasSignals: true,
    shortlistCount: [...shortlistSet].filter((id) => byId.has(id)).length,
    compareCount: [...compareSet].filter((id) => byId.has(id)).length,
    uniqueItemCount: signalEntries.length,
    personaTitle,
    personaSubtitle,
    categoryAffinities,
    brandAffinities,
    budget,
    trust,
    watchlistAlerts: watchlistAlerts.slice(0, 6),
    recommendations: recommendations.slice(0, 6),
  };
}

function scoreCatalogEntryAgainstProfile(
  item: ProfileCatalogEntry,
  ctx: {
    activeCatShares: Map<string, number>;
    brandShares: Map<string, number>;
    budget: BudgetSweetSpot | null;
    avgDiscountPercent: number;
    strictTrustMode: boolean;
  },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const p = item.product;
  const cat = p.category ?? "Electronics";
  const catShare = ctx.activeCatShares.get(cat) ?? 0;
  if (catShare > 0) {
    // Up to 38 points for preferred category
    score += Math.min(38, 18 + Math.round(catShare * 0.25));
    reasons.push(`Matches ${cat}`);
  }

  const brand = p.brand ?? "";
  const brandShare = brand ? ctx.brandShares.get(brand) ?? 0 : 0;
  if (brandShare > 0) {
    // Up to 22 points for trusted brand
    score += Math.min(22, 12 + Math.round(brandShare * 0.18));
    reasons.push(`Saved brand (${brand})`);
  }

  if (ctx.budget && typeof p.price === "number" && p.price > 0) {
    const lo = Math.max(500, ctx.budget.p25Inr * 0.65);
    const hi = ctx.budget.p75Inr * 1.45;
    if (p.price >= lo && p.price <= hi) {
      score += 20;
      reasons.push(`Within ${formatShortInr(ctx.budget.p25Inr)}–${formatShortInr(ctx.budget.p75Inr)} range`);
    } else {
      const ratio =
        p.price < lo ? p.price / lo : hi / Math.max(1, p.price);
      if (ratio >= 0.6) {
        score += Math.round(ratio * 12);
      }
    }
  }

  const genuine = getGenuinePercent(item.snapshot);
  if (genuine >= 88) {
    score += 16;
    reasons.push(`${genuine}% genuine reviews`);
  } else if (genuine >= 82) {
    score += 10;
    reasons.push(`${genuine}% genuine reviews`);
  } else if (genuine < 75) {
    score -= 15;
  }

  const discount = p.discountPercent ?? 0;
  if (ctx.avgDiscountPercent >= 20 && discount >= 20) {
    score += 6;
    if (reasons.length < 3) {
      reasons.push(`${Math.round(discount)}% off MRP`);
    }
  } else if ((p.rating ?? 0) >= 4.4) {
    score += 4;
  }

  return {
    score: Math.max(0, Math.min(99, score)),
    reasons: reasons.slice(0, 3),
  };
}

/**
 * Computes a numeric sort score for every catalog product when "For You (Taste Match)" is active.
 */
export function computeForYouCatalogScores<T extends ProfileCatalogEntry>(
  catalog: T[],
  inputs: BuyerProfileInputs,
): Map<string, number> {
  const scores = new Map<string, number>();
  const profile = computeBuyerProfile(catalog, inputs);
  if (!profile.hasSignals) {
    for (const item of catalog) {
      const genuine = getGenuinePercent(item.snapshot);
      scores.set(item.product.id, genuine + (item.product.rating ?? 0) * 5);
    }
    return scores;
  }

  const activeCatShares = new Map<string, number>();
  for (const c of profile.categoryAffinities) {
    if (!c.muted) activeCatShares.set(c.category, c.sharePercent);
  }
  const brandShares = new Map<string, number>();
  for (const b of profile.brandAffinities) {
    brandShares.set(b.brand, b.sharePercent);
  }
  const mutedSet = new Set(inputs.mutedCategories ?? []);

  for (const item of catalog) {
    const cat = item.product.category ?? "Electronics";
    if (mutedSet.has(cat)) {
      scores.set(item.product.id, -10);
      continue;
    }
    const { score } = scoreCatalogEntryAgainstProfile(item, {
      activeCatShares,
      brandShares,
      budget: profile.budget,
      avgDiscountPercent: profile.trust?.avgDiscountPercent ?? 0,
      strictTrustMode: Boolean(inputs.strictTrustMode),
    });
    scores.set(item.product.id, score);
  }

  return scores;
}
