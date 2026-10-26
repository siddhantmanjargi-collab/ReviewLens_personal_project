"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  ExternalLink,
  Star,
  ShieldCheck,
  AlertTriangle,
  Heart,
  CheckSquare,
  Square,
  ThumbsUp,
  Plus,
  Loader2,
  Search,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
} from "lucide-react";
import type { ProductClusterForensics } from "@/lib/forensics";
import type { ProductClaimVerificationReport } from "@/lib/gemini";
import type { ProductRecord, ReviewRecord } from "@/lib/types";
import { ProductArtwork } from "./ProductArtwork";

interface ProductDetailModalProps {
  product: ProductRecord | null;
  initialReviews?: ReviewRecord[];
  initialReviewAnalyses?: Record<string, any>;
  initialSummary?: any;
  isCompared: boolean;
  isShortlisted: boolean;
  onToggleCompare: (id: string) => void;
  onToggleShortlist: (id: string) => void;
  onClose: () => void;
  onRefreshCatalog: () => void;
}

type ModalWorkspaceTab = "reviews" | "forensics" | "factcheck" | "specs";
type TrustTierFilter = "all" | "genuine" | "moderate" | "high" | "mismatch";
type SentimentFilter = "all" | "positive" | "neutral" | "negative";
type VerifiedFilter = "all" | "verified" | "unverified";
type AspectPolarityFilter = "all" | "positive" | "negative";
type ReviewSortOption =
  | "helpful"
  | "authentic_first"
  | "suspicious_first"
  | "mismatch_first"
  | "newest"
  | "rating_high"
  | "rating_low";

const WIDTH_BUCKETS = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
] as const;

function pctToWidthClass(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const idx = Math.max(0, Math.min(20, Math.round(clamped / 5)));
  return WIDTH_BUCKETS[idx] ?? "w-0";
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  initialReviews,
  initialReviewAnalyses,
  initialSummary,
  isCompared,
  isShortlisted,
  onToggleCompare,
  onToggleShortlist,
  onClose,
  onRefreshCatalog,
}) => {
  const [activeTab, setActiveTab] = useState<ModalWorkspaceTab>("reviews");
  const [reviews, setReviews] = useState<ReviewRecord[]>(initialReviews ?? []);
  const [reviewAnalyses, setReviewAnalyses] = useState<Record<string, any>>(
    initialReviewAnalyses ?? {},
  );
  const [summary, setSummary] = useState<any>(initialSummary ?? null);
  const [clusterForensics, setClusterForensics] = useState<ProductClusterForensics | null>(null);
  const [loading, setLoading] = useState(!(initialReviews && initialReviews.length > 0));

  // Web Claim Verification state (Gemini + Google Search Grounding)
  const [claimReport, setClaimReport] = useState<ProductClaimVerificationReport | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Multi-dimensional review segregation state
  const [trustFilter, setTrustFilter] = useState<TrustTierFilter>("all");
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("all");
  const [selectedStar, setSelectedStar] = useState<number | "all">("all");
  const [selectedAspect, setSelectedAspect] = useState<string>("all");
  const [aspectPolarity, setAspectPolarity] = useState<AspectPolarityFilter>("all");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewSort, setReviewSort] = useState<ReviewSortOption>("helpful");
  const [expandedForensics, setExpandedForensics] = useState<Record<string, boolean>>({});

  // Submit review state
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [revTitle, setRevTitle] = useState("");
  const [revText, setRevText] = useState("");
  const [revName, setRevName] = useState("");
  const [revRating, setRevRating] = useState(5);
  const [revSourceType, setRevSourceType] = useState<"site_user" | "user_pasted">("site_user");
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const resetSegregationFilters = () => {
    setTrustFilter("all");
    setSentimentFilter("all");
    setVerifiedFilter("all");
    setSelectedStar("all");
    setSelectedAspect("all");
    setAspectPolarity("all");
    setReviewQuery("");
    setReviewSort("helpful");
  };

  const fetchProductBundle = (productId: string, showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    fetch(`/api/product-bundle?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((bundle) => {
        if (Array.isArray(bundle.reviews) && bundle.reviews.length > 0) {
          setReviews(bundle.reviews);
        }
        if (bundle.reviewAnalyses && Object.keys(bundle.reviewAnalyses).length > 0) {
          setReviewAnalyses(bundle.reviewAnalyses);
        }
        if (bundle.summary) {
          setSummary(bundle.summary);
        }
        if (bundle.clusterForensics) {
          setClusterForensics(bundle.clusterForensics);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!product) return;
    setActiveTab("reviews");
    resetSegregationFilters();
    setExpandedForensics({});
    setClaimReport(null);
    setClaimError(null);
    setClusterForensics(null);
    setSubmitStatus(null);
    setShowWriteForm(false);

    const hasPreloaded = Boolean(initialReviews && initialReviews.length > 0);
    setReviews(initialReviews ?? []);
    setReviewAnalyses(initialReviewAnalyses ?? {});
    setSummary(initialSummary ?? null);

    fetchProductBundle(product.id, !hasPreloaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Compute live client-side segregation counts & rating adjustment
  const segregationStats = useMemo(() => {
    let genuine = 0;
    let moderate = 0;
    let high = 0;
    let mismatch = 0;
    let verified = 0;
    let unverified = 0;
    let posSent = 0;
    let neuSent = 0;
    let negSent = 0;

    let rawStarSum = 0;
    let cleanStarSum = 0;
    let cleanStarCount = 0;

    const starRows = new Map<number, { star: number; total: number; genuine: number; flagged: number }>();
    for (const s of [5, 4, 3, 2, 1]) {
      starRows.set(s, { star: s, total: 0, genuine: 0, flagged: 0 });
    }

    for (const rev of reviews) {
      rawStarSum += rev.rating;
      if (rev.verifiedPurchase) verified += 1;
      else unverified += 1;

      const ana = reviewAnalyses[rev.id];
      const risk = ana?.authenticityRisk ?? 0.1;
      const mis = ana?.riskBreakdown?.ratingMismatch ?? 0;
      const sent =
        ana?.sentiment ?? (rev.rating >= 4 ? "positive" : rev.rating <= 2 ? "negative" : "neutral");

      if (sent === "positive") posSent += 1;
      else if (sent === "neutral") neuSent += 1;
      else negSent += 1;

      if (risk >= 0.66) high += 1;
      else if (risk >= 0.33) moderate += 1;
      else genuine += 1;

      if (mis >= 0.3) mismatch += 1;

      const starKey = Math.min(5, Math.max(1, Math.round(rev.rating)));
      const row = starRows.get(starKey)!;
      row.total += 1;
      if (risk >= 0.33 || mis >= 0.3) {
        row.flagged += 1;
      } else {
        row.genuine += 1;
        cleanStarSum += rev.rating;
        cleanStarCount += 1;
      }
    }

    const rawAvg = reviews.length > 0 ? rawStarSum / reviews.length : product?.rating ?? 0;
    const genuineAvg = cleanStarCount > 0 ? cleanStarSum / cleanStarCount : rawAvg;

    return {
      genuine,
      moderate,
      high,
      mismatch,
      verified,
      unverified,
      posSent,
      neuSent,
      negSent,
      rawAvg,
      genuineAvg,
      cleanStarCount,
      delta: Math.round((genuineAvg - rawAvg) * 100) / 100,
      starHistogram: [5, 4, 3, 2, 1].map((s) => starRows.get(s)!),
    };
  }, [reviews, reviewAnalyses, product?.rating]);

  // Segregate aspects into Genuine Buyer Praise vs Documented Complaints
  const { praisedAspects, criticalAspects, allAspects } = useMemo(() => {
    const aspectsList: any[] = summary?.aspects ?? [];
    const praised = aspectsList.filter(
      (a) => (a.positiveCount ?? 1) >= (a.negativeCount ?? 0) && a.positivePercent >= 50,
    );
    const critical = aspectsList.filter((a) => (a.negativeCount ?? 0) > 0 || a.negativePercent > 0);
    return {
      praisedAspects: praised.slice(0, 6),
      criticalAspects: critical
        .slice()
        .sort(
          (a, b) =>
            (b.negativeCount ?? 0) - (a.negativeCount ?? 0) || b.negativePercent - a.negativePercent,
        )
        .slice(0, 6),
      allAspects: aspectsList,
    };
  }, [summary]);

  const activeSegregationCount = useMemo(() => {
    let c = 0;
    if (trustFilter !== "all") c += 1;
    if (sentimentFilter !== "all") c += 1;
    if (verifiedFilter !== "all") c += 1;
    if (selectedStar !== "all") c += 1;
    if (selectedAspect !== "all") c += 1;
    if (aspectPolarity !== "all") c += 1;
    if (reviewQuery.trim()) c += 1;
    return c;
  }, [
    trustFilter,
    sentimentFilter,
    verifiedFilter,
    selectedStar,
    selectedAspect,
    aspectPolarity,
    reviewQuery,
  ]);

  const segregatedReviews = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();

    const filtered = reviews.filter((rev) => {
      const ana = reviewAnalyses[rev.id];
      const risk: number = ana?.authenticityRisk ?? 0.1;
      const mis: number = ana?.riskBreakdown?.ratingMismatch ?? 0;
      const sent: string =
        ana?.sentiment ?? (rev.rating >= 4 ? "positive" : rev.rating <= 2 ? "negative" : "neutral");

      if (trustFilter === "genuine" && (risk >= 0.33 || mis >= 0.3)) return false;
      if (trustFilter === "moderate" && (risk < 0.33 || risk >= 0.66)) return false;
      if (trustFilter === "high" && risk < 0.66) return false;
      if (trustFilter === "mismatch" && mis < 0.3) return false;

      if (sentimentFilter !== "all" && sent !== sentimentFilter) return false;

      if (verifiedFilter === "verified" && !rev.verifiedPurchase) return false;
      if (verifiedFilter === "unverified" && rev.verifiedPurchase) return false;

      if (selectedStar !== "all" && Math.round(rev.rating) !== selectedStar) return false;

      if (selectedAspect !== "all") {
        const matchedAspect = ana?.aspects?.find((a: any) => a.name === selectedAspect);
        const textFallback = rev.reviewText.toLowerCase().includes(selectedAspect.toLowerCase());
        if (!matchedAspect && !textFallback) return false;
        if (aspectPolarity !== "all" && matchedAspect && matchedAspect.sentiment !== aspectPolarity) {
          return false;
        }
      }

      if (q) {
        const signalText = (ana?.reasoningSignals ?? []).join(" ").toLowerCase();
        const aspectText = (ana?.aspects ?? []).map((a: any) => a.name).join(" ").toLowerCase();
        const hay =
          `${rev.reviewTitle ?? ""} ${rev.reviewText} ${rev.reviewerName ?? ""} ${signalText} ${aspectText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const anaA = reviewAnalyses[a.id];
      const anaB = reviewAnalyses[b.id];
      const riskA = anaA?.authenticityRisk ?? 0.1;
      const riskB = anaB?.authenticityRisk ?? 0.1;
      const misA = anaA?.riskBreakdown?.ratingMismatch ?? 0;
      const misB = anaB?.riskBreakdown?.ratingMismatch ?? 0;

      switch (reviewSort) {
        case "authentic_first":
          return riskA - riskB || (b.helpfulVotes ?? 0) - (a.helpfulVotes ?? 0);
        case "suspicious_first":
          return riskB - riskA;
        case "mismatch_first":
          return misB - misA || riskB - riskA;
        case "newest":
          return (b.reviewDate ?? "").localeCompare(a.reviewDate ?? "");
        case "rating_high":
          return b.rating - a.rating || (b.helpfulVotes ?? 0) - (a.helpfulVotes ?? 0);
        case "rating_low":
          return a.rating - b.rating || (b.helpfulVotes ?? 0) - (a.helpfulVotes ?? 0);
        case "helpful":
        default:
          return (b.helpfulVotes ?? 0) - (a.helpfulVotes ?? 0);
      }
    });
  }, [
    reviews,
    reviewAnalyses,
    trustFilter,
    sentimentFilter,
    verifiedFilter,
    selectedStar,
    selectedAspect,
    aspectPolarity,
    reviewQuery,
    reviewSort,
  ]);

  if (!product) return null;

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revText.trim()) return;
    setSubmitting(true);
    setSubmitStatus(null);

    try {
      const res = await fetch(`/api/import-reviews?productId=${product.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": "dev-admin-key",
        },
        body: JSON.stringify({
          dataSourceType: revSourceType,
          reviews: [
            {
              reviewTitle: revTitle.trim() || undefined,
              reviewText: revText.trim(),
              rating: revRating,
              reviewerName: revName.trim() || "Verified Shopper",
              reviewDate: new Date().toISOString().slice(0, 10),
              verifiedPurchase: revSourceType === "site_user",
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Failed to add review");

      setSubmitStatus(
        revSourceType === "user_pasted"
          ? "Analyzed and saved privately in snapshot aggregates (pasted text is never exposed publicly)."
          : "Customer review published, analyzed by ReviewLens, and segregated into the live snapshot!",
      );
      setRevTitle("");
      setRevText("");
      fetchProductBundle(product.id, false);
      onRefreshCatalog();
    } catch (err: any) {
      setSubmitStatus(err.message || "Error submitting review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyClaims = async () => {
    setClaimLoading(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/verify-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification request failed");
      setClaimReport(data);
    } catch (err: any) {
      setClaimError(err.message || "Could not verify claims right now.");
    } finally {
      setClaimLoading(false);
    }
  };

  const handleExportProductAudit = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      product: {
        asin: product.externalId,
        name: product.productName,
        brand: product.brand,
        category: product.category,
        priceInr: product.price,
        marketplaceRating: product.rating,
        amazonUrl: product.sourceUrl,
        officialUrl: product.officialUrl,
      },
      segregationSummary: {
        totalReviews: reviews.length,
        rawAverageRating: Number(segregationStats.rawAvg.toFixed(2)),
        genuineAdjustedRating: Number(segregationStats.genuineAvg.toFixed(2)),
        ratingDelta: segregationStats.delta,
        genuineCount: segregationStats.cleanStarCount,
        mismatchCount: segregationStats.mismatch,
        moderateRiskCount: segregationStats.moderate,
        highRiskSpamCount: segregationStats.high,
      },
      clusterForensics,
      reviews: reviews.map((r) => ({
        reviewer: r.reviewerName,
        rating: r.rating,
        verifiedPurchase: r.verifiedPurchase,
        date: r.reviewDate,
        title: r.reviewTitle,
        text: r.reviewText,
        analysis: reviewAnalyses[r.id] ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reviewlens-audit-${product.externalId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleForensics = (revId: string) => {
    setExpandedForensics((prev) => ({ ...prev, [revId]: !prev[revId] }));
  };

  const specEntries = Object.entries(product.specs ?? {});
  const avgRisk = summary?.details?.averageRisk ?? 0.14;
  const genuinePct = Math.round((1 - avgRisk) * 100);
  const forensicSignalCount =
    (clusterForensics?.crossProductReviewers.length ?? 0) +
    (clusterForensics?.duplicatePairs.length ?? 0) +
    (clusterForensics?.dateBursts.length ?? 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/65 dark:bg-black/80 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl my-3 sm:my-6 overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Top Breadcrumb Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 truncate">
            <span>Catalog</span>
            <span aria-hidden="true">/</span>
            <span>{product.category ?? "Electronics"}</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-900 dark:text-white truncate">
              {product.brand ?? product.externalId} · {product.externalId}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportProductAudit}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export Audit JSON
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close product view"
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact Above-the-Fold Product Overview Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            <div className="md:col-span-4 lg:col-span-3">
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
                <ProductArtwork
                  imageUrl={product.imageUrl}
                  remoteImageUrl={product.remoteImageUrl}
                  category={product.category}
                  brand={product.brand}
                  model={product.model}
                  deviceType={product.deviceType}
                  productName={product.productName}
                  specs={product.specs}
                />
              </div>
            </div>

            <div className="md:col-span-8 lg:col-span-9 space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {product.brand ?? "Marketplace"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ASIN:{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {product.externalId}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    Verified Marketplace Identity
                  </span>
                </div>

                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                  {product.productName}
                </h1>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mt-1.5 tabular-nums">
                  <span className="inline-flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                    {product.rating?.toFixed(1) ?? "N/A"} raw avg
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {segregationStats.genuineAvg.toFixed(2)}★ Genuine-Adjusted
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{(product.reviewCount ?? 0).toLocaleString("en-IN")} global ratings</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {genuinePct}% Genuine Pattern
                  </span>
                </div>
              </div>

              {/* Price + Verified Storefront Links + Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-baseline gap-2.5 tabular-nums">
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    {product.price !== null
                      ? `₹${product.price.toLocaleString("en-IN")}`
                      : "Check Marketplace"}
                  </span>
                  {product.mrp && product.price && product.mrp > product.price && (
                    <>
                      <span className="text-xs text-slate-400 dark:text-slate-500 line-through">
                        MRP ₹{product.mrp.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        ({product.discountPercent}% off)
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {product.sourceUrl && (
                    <a
                      href={product.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      Amazon.in <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <a
                    href={`https://www.flipkart.com/search?q=${encodeURIComponent(
                      `${product.brand ?? ""} ${product.model ?? product.productName}`.trim(),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    Flipkart <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {product.officialUrl && (
                    <a
                      href={product.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      Official {product.brand ?? "Site"} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleCompare(product.id)}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isCompared ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    {isCompared ? "Comparing" : "Compare"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleShortlist(product.id)}
                    aria-label="Save to shortlist"
                    className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                      isShortlisted
                        ? "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isShortlisted ? "fill-rose-600 dark:fill-rose-400" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Immediate Workspace Tab Bar — Customer Reviews Default Active */}
        <div className="px-6 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 overflow-x-auto text-xs font-semibold tabular-nums">
          {(
            [
              { id: "reviews", label: `Customer Reviews (${reviews.length})` },
              {
                id: "forensics",
                label:
                  forensicSignalCount > 0
                    ? `Cluster & Aspect Forensics (${forensicSignalCount} alerts)`
                    : "Cluster & Aspect Forensics",
              },
              { id: "factcheck", label: "Buyer Claim Fact-Check" },
              { id: "specs", label: `Specifications (${specEntries.length})` },
            ] as { id: ModalWorkspaceTab; label: string }[]
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 border-b-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? "border-slate-900 dark:border-amber-400 text-slate-900 dark:text-amber-400"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* =====================================================================
              TAB 1: CUSTOMER REVIEWS & INSTANT SEGREGATION (DEFAULT ABOVE THE FOLD)
             ===================================================================== */}
          {activeTab === "reviews" && (
            <div className="space-y-4">
              {/* Compact Segregation Toolbar */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg text-xs tabular-nums">
                    {(
                      [
                        { id: "all", label: `All (${reviews.length})` },
                        { id: "genuine", label: `Genuine (${segregationStats.cleanStarCount})` },
                        { id: "mismatch", label: `Star-Text Mismatch (${segregationStats.mismatch})` },
                        { id: "moderate", label: `Moderate Risk (${segregationStats.moderate})` },
                        { id: "high", label: `High Risk Spam (${segregationStats.high})` },
                      ] as { id: TrustTierFilter; label: string }[]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTrustFilter(tab.id)}
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          trustFilter === tab.id
                            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-amber-400 font-semibold shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Verified Purchase Segmented Filter */}
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg text-xs tabular-nums">
                    {(
                      [
                        { id: "all", label: "All Buyers" },
                        { id: "verified", label: `Verified (${segregationStats.verified})` },
                        { id: "unverified", label: `Unverified (${segregationStats.unverified})` },
                      ] as { id: VerifiedFilter; label: string }[]
                    ).map((vTab) => (
                      <button
                        key={vTab.id}
                        type="button"
                        onClick={() => setVerifiedFilter(vTab.id)}
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          verifiedFilter === vTab.id
                            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        {vTab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Topic / Star Filter + Search + Sort + Write Review */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={reviewQuery}
                      onChange={(e) => setReviewQuery(e.target.value)}
                      placeholder="Filter reviews by keyword, aspect, or reviewer..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                    />
                    {reviewQuery && (
                      <button
                        type="button"
                        onClick={() => setReviewQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedStar === "all" ? "all" : String(selectedStar)}
                      onChange={(e) =>
                        setSelectedStar(e.target.value === "all" ? "all" : Number(e.target.value))
                      }
                      aria-label="Filter by star rating"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Stars</option>
                      {[5, 4, 3, 2, 1].map((s) => (
                        <option key={s} value={s}>
                          {s}★ Only
                        </option>
                      ))}
                    </select>

                    <select
                      value={reviewSort}
                      onChange={(e) => setReviewSort(e.target.value as ReviewSortOption)}
                      aria-label="Sort segregated reviews"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                      <option value="helpful">Sort: Most Helpful</option>
                      <option value="authentic_first">Sort: Lowest Risk (Genuine First)</option>
                      <option value="suspicious_first">Sort: Highest Risk (Spam First)</option>
                      <option value="mismatch_first">Sort: Star-Text Mismatch First</option>
                      <option value="newest">Sort: Newest First</option>
                      <option value="rating_high">Sort: Highest Stars</option>
                      <option value="rating_low">Sort: Lowest Stars</option>
                    </select>

                    {activeSegregationCount > 0 && (
                      <button
                        type="button"
                        onClick={resetSegregationFilters}
                        className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset ({activeSegregationCount})
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowWriteForm((v) => !v)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showWriteForm ? "Hide Form" : "Write / Paste Review"}
                    </button>
                  </div>
                </div>

                {/* Aspect Filter Strip */}
                {allAspects.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                      Topics:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAspect("all");
                        setAspectPolarity("all");
                      }}
                      className={`px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer ${
                        selectedAspect === "all"
                          ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 border-slate-900 dark:border-amber-400 font-semibold"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                      }`}
                    >
                      All
                    </button>
                    {allAspects.map((asp) => {
                      const isSelected = selectedAspect === asp.aspectName;
                      return (
                        <button
                          key={asp.aspectName}
                          type="button"
                          onClick={() => {
                            setSelectedAspect(isSelected ? "all" : asp.aspectName);
                            setAspectPolarity("all");
                          }}
                          className={`px-2 py-0.5 text-[11px] rounded border transition-colors tabular-nums cursor-pointer ${
                            isSelected
                              ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 border-slate-900 dark:border-amber-400 font-semibold"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                          }`}
                        >
                          <span className="capitalize">{asp.aspectName}</span> ({asp.mentionCount})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Write / Paste Review Form */}
              {showWriteForm && (
                <form
                  onSubmit={handleAddReview}
                  className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Your name (optional)"
                      value={revName}
                      onChange={(e) => setRevName(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                    />
                    <select
                      value={revRating}
                      onChange={(e) => setRevRating(Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} Stars
                        </option>
                      ))}
                    </select>
                    <select
                      value={revSourceType}
                      onChange={(e) =>
                        setRevSourceType(e.target.value as "site_user" | "user_pasted")
                      }
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                    >
                      <option value="site_user">Public Verified Review (site_user)</option>
                      <option value="user_pasted">Private Pasted Audit (user_pasted)</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Review headline"
                    value={revTitle}
                    onChange={(e) => setRevTitle(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                  />
                  <textarea
                    rows={3}
                    required
                    placeholder="Share concrete usage details (battery hours, thermals, build quality, pros & cons) — automatically analyzed & segregated on submit..."
                    value={revText}
                    onChange={(e) => setRevText(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                  />
                  {submitStatus && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      {submitStatus}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {submitting ? "Analyzing & Saving..." : "Submit & Segregate Review"}
                    </button>
                  </div>
                </form>
              )}

              {/* Count & Summary Line */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>
                  Showing{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {segregatedReviews.length}
                  </strong>{" "}
                  of{" "}
                  <strong className="text-slate-900 dark:text-white">{reviews.length}</strong>{" "}
                  audited customer reviews · Genuine-adjusted rating:{" "}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {segregationStats.genuineAvg.toFixed(2)}★
                  </strong>{" "}
                  (vs {segregationStats.rawAvg.toFixed(2)}★ raw)
                </span>
              </div>

              {/* Segregated Reviews Stream */}
              {loading && reviews.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  Loading product-specific customer reviews & Gemini signals...
                </div>
              ) : segregatedReviews.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                  <p>No reviews match the active segregation filters.</p>
                  <button
                    type="button"
                    onClick={resetSegregationFilters}
                    className="text-amber-700 dark:text-amber-400 font-semibold hover:underline cursor-pointer"
                  >
                    Clear all segregation filters
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950/40">
                  {segregatedReviews.map((rev) => {
                    const ana = reviewAnalyses[rev.id];
                    const risk: number = ana?.authenticityRisk ?? 0.1;
                    const mis: number = ana?.riskBreakdown?.ratingMismatch ?? 0;
                    const isHighRisk = risk >= 0.66;
                    const isModRisk = risk >= 0.33 && risk < 0.66;
                    const isMismatch = mis >= 0.3;
                    const isForensicsOpen = Boolean(expandedForensics[rev.id]);
                    const crossOverlap = clusterForensics?.crossProductReviewers.find(
                      (c) => c.reviewerName.toLowerCase() === (rev.reviewerName ?? "").toLowerCase(),
                    );

                    return (
                      <div key={rev.id} className="p-4 sm:p-5 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-0.5 text-amber-500 dark:text-amber-400 shrink-0">
                              {[...Array(5)].map((_, idx) => (
                                <Star
                                  key={idx}
                                  className={`w-3.5 h-3.5 ${
                                    idx < rev.rating
                                      ? "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
                                      : "text-slate-200 dark:text-slate-700"
                                  }`}
                                />
                              ))}
                            </span>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                              {rev.reviewTitle ?? "Customer Review"}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium tabular-nums">
                            {isMismatch && (
                              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                                Star-Text Mismatch ({rev.rating}★ vs {ana?.sentiment ?? "critical"} prose)
                              </span>
                            )}
                            {isMismatch && (
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                            )}
                            {isHighRisk ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {Math.round(risk * 100)}% Suspicion Risk (High)
                              </span>
                            ) : isModRisk ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {Math.round(risk * 100)}% Suspicion Risk (Moderate)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {Math.round((1 - risk) * 100)}% Genuine Pattern ({Math.round(risk * 100)}% risk)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Unboxed Metadata Line */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {rev.reviewerName ?? "Shopper"}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{rev.reviewDate ?? "Recent"}</span>
                          <span aria-hidden="true">·</span>
                          {rev.verifiedPurchase ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              Verified Purchase
                            </span>
                          ) : (
                            <span className="text-rose-700 dark:text-rose-400">
                              Unverified Purchase
                            </span>
                          )}
                          {crossOverlap && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-rose-700 dark:text-rose-400 font-semibold">
                                Multi-product handle ({crossOverlap.otherProductCount + 1} items)
                              </span>
                            </>
                          )}
                          {ana?.sentiment && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize">
                                Prose:{" "}
                                <strong
                                  className={
                                    ana.sentiment === "positive"
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : ana.sentiment === "negative"
                                        ? "text-rose-700 dark:text-rose-400"
                                        : "text-slate-700 dark:text-slate-200"
                                  }
                                >
                                  {ana.sentiment}
                                </strong>{" "}
                                ({Math.round((ana.sentimentConfidence ?? 0.9) * 100)}%)
                              </span>
                            </>
                          )}
                          {rev.helpfulVotes ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1">
                                <ThumbsUp className="w-3 h-3" /> {rev.helpfulVotes} helpful
                              </span>
                            </>
                          ) : null}
                        </div>

                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed pt-0.5">
                          {rev.reviewText}
                        </p>

                        {ana && (
                          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span>
                                Signals:{" "}
                                <span className="text-slate-700 dark:text-slate-200">
                                  {ana.reasoningSignals?.length > 0
                                    ? ana.reasoningSignals.join(" · ")
                                    : "Standard personal usage structure"}
                                </span>
                              </span>
                              {ana.aspects?.length > 0 && (
                                <span>
                                  · Aspects:{" "}
                                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                                    {ana.aspects
                                      .map((a: any) => `${a.name} (${a.sentiment})`)
                                      .join(" / ")}
                                  </span>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleForensics(rev.id)}
                              className="text-xs font-semibold text-slate-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {isForensicsOpen ? (
                                <>
                                  Hide Forensics <ChevronUp className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  Inspect Forensics <ChevronDown className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {ana && isForensicsOpen && (
                          <div className="mt-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs tabular-nums">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                                <span className="text-slate-500 dark:text-slate-400 block">
                                  Linguistic Heuristics (50% wt)
                                </span>
                                <strong className="text-sm text-slate-900 dark:text-white">
                                  {Math.round((ana.riskBreakdown?.heuristicRisk ?? 0) * 100)}% risk
                                </strong>
                              </div>
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                                <span className="text-slate-500 dark:text-slate-400 block">
                                  Gemini Text Audit (40% wt)
                                </span>
                                <strong className="text-sm text-slate-900 dark:text-white">
                                  {Math.round((ana.riskBreakdown?.geminiRisk ?? 0) * 100)}% risk
                                </strong>
                              </div>
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                                <span className="text-slate-500 dark:text-slate-400 block">
                                  Star-Prose Mismatch (10% wt)
                                </span>
                                <strong
                                  className={`text-sm ${
                                    (ana.riskBreakdown?.ratingMismatch ?? 0) >= 0.3
                                      ? "text-amber-700 dark:text-amber-400"
                                      : "text-slate-900 dark:text-white"
                                  }`}
                                >
                                  {Math.round((ana.riskBreakdown?.ratingMismatch ?? 0) * 100)}% penalty
                                </strong>
                              </div>
                            </div>

                            {ana.riskBreakdown?.signals && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {ana.riskBreakdown.signals
                                  .filter((s: any) => s.applicable)
                                  .map((sig: any) => (
                                    <div
                                      key={sig.name}
                                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-medium text-slate-800 dark:text-slate-200 capitalize block">
                                          {sig.name.replace(/_/g, " ")}
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                                          {sig.detail}
                                        </span>
                                      </div>
                                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                                        {Math.round(sig.strength * 100)}%
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 2: SHILL-RING OVERLAP, 3-GRAM SIMILARITY & ASPECT BREAKDOWN
             ===================================================================== */}
          {activeTab === "forensics" && (
            <div className="space-y-6">
              {/* Adjusted Rating + Star Histogram + Prose Sentiment */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <div className="lg:col-span-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 pb-4 lg:pb-0 lg:pr-5 tabular-nums">
                  <div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">
                      Genuine-Adjusted Star Score
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                        {segregationStats.genuineAvg.toFixed(2)}★
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        vs{" "}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {segregationStats.rawAvg.toFixed(2)}★
                        </strong>{" "}
                        unfiltered
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Recalculated from{" "}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {segregationStats.cleanStarCount} of {reviews.length}
                      </strong>{" "}
                      reviews after isolating promotional hype and accidental star-tap mismatches (
                      {segregationStats.delta >= 0 ? "+" : ""}
                      {segregationStats.delta.toFixed(2)}★ delta).
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 pb-4 lg:pb-0 lg:px-2 space-y-2 tabular-nums">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                    Star Distribution (Genuine vs Flagged)
                  </span>
                  {segregationStats.starHistogram.map((row) => {
                    const total = Math.max(1, reviews.length);
                    const genPct = (row.genuine / total) * 100;
                    const flagPct = (row.flagged / total) * 100;
                    return (
                      <div key={row.star} className="flex items-center gap-2.5 text-xs">
                        <span className="w-7 text-left shrink-0">{row.star}★</span>
                        <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          <div
                            className={`h-full bg-emerald-600 dark:bg-emerald-500 ${pctToWidthClass(genPct)}`}
                          />
                          <div
                            className={`h-full bg-rose-500 dark:bg-rose-400 ${pctToWidthClass(flagPct)}`}
                          />
                        </div>
                        <span className="w-16 text-right text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {row.genuine}G{row.flagged > 0 ? ` · ${row.flagged}F` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="lg:col-span-4 space-y-2.5 tabular-nums">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block">
                    True Prose Sentiment (Ignoring Stars)
                  </span>
                  {(
                    [
                      {
                        label: "Positive Prose",
                        count: segregationStats.posSent,
                        textCls: "text-emerald-700 dark:text-emerald-400",
                        barCls: "bg-emerald-600 dark:bg-emerald-500",
                      },
                      {
                        label: "Neutral / Balanced",
                        count: segregationStats.neuSent,
                        textCls: "text-slate-700 dark:text-slate-300",
                        barCls: "bg-slate-500 dark:bg-slate-400",
                      },
                      {
                        label: "Negative / Critical",
                        count: segregationStats.negSent,
                        textCls: "text-rose-700 dark:text-rose-400",
                        barCls: "bg-rose-600 dark:bg-rose-500",
                      },
                    ] as const
                  ).map((item) => {
                    const pct =
                      reviews.length > 0 ? Math.round((item.count / reviews.length) * 100) : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-700 dark:text-slate-200 font-medium">
                            {item.label}
                          </span>
                          <span className={`font-semibold ${item.textCls}`}>
                            {item.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${item.barCls} ${pctToWidthClass(pct)} rounded-full`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cross-Product Shill-Ring Overlap & 3-Gram Jaccard Similarity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 bg-white dark:bg-slate-900">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Cross-Product Reviewer Overlap (Shill Graph)
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {clusterForensics?.crossProductReviewers.length ?? 0} recurring handles
                    </span>
                  </div>
                  {clusterForensics?.crossProductReviewers.length ? (
                    <div className="space-y-2.5 text-xs">
                      {clusterForensics.crossProductReviewers.map((entry) => (
                        <div
                          key={entry.reviewerName}
                          className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 tabular-nums"
                        >
                          <div className="flex items-center justify-between">
                            <strong className="font-mono text-rose-700 dark:text-rose-400">
                              {entry.reviewerName}
                            </strong>
                            <span className="text-slate-500 dark:text-slate-400">
                              Posted on {entry.otherProductCount} other catalog items
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">
                            Also reviewed:{" "}
                            {entry.otherProducts
                              .map(
                                (op) =>
                                  `${op.externalId} (${op.rating}★, ${Math.round(op.risk * 100)}% risk)`,
                              )
                              .join(" · ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No cross-product shill reviewer handles detected on this product.
                    </p>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 bg-white dark:bg-slate-900">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      3-Gram Shingle Jaccard & Date Burst Audit
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {(clusterForensics?.duplicatePairs.length ?? 0) +
                        (clusterForensics?.dateBursts.length ?? 0)}{" "}
                      signals
                    </span>
                  </div>
                  {clusterForensics?.duplicatePairs.length || clusterForensics?.dateBursts.length ? (
                    <div className="space-y-2 text-xs tabular-nums">
                      {clusterForensics?.duplicatePairs.map((pair, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                        >
                          <div className="flex justify-between font-semibold text-amber-700 dark:text-amber-400">
                            <span>
                              {pair.reviewerA} ↔ {pair.reviewerB}
                            </span>
                            <span>{Math.round(pair.jaccardSimilarity * 100)}% 3-gram overlap</span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            &ldquo;{pair.titleA}&rdquo;
                          </p>
                        </div>
                      ))}
                      {clusterForensics?.dateBursts.map((b) => (
                        <div
                          key={b.date}
                          className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                        >
                          <span className="text-slate-700 dark:text-slate-200">
                            Same-day burst on <strong className="font-mono">{b.date}</strong> ({b.count} reviews)
                          </span>
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {Math.round(b.avgRisk * 100)}% avg risk
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Review timestamps and 3-gram phrasing show organic dispersion with zero template cloning.
                    </p>
                  )}
                </div>
              </div>

              {/* Pros & Cons Topic Jumpers */}
              {(praisedAspects.length > 0 || criticalAspects.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                      What Genuine Buyers Praise (Click to jump to reviews)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {praisedAspects.map((asp) => (
                        <button
                          key={asp.aspectName}
                          type="button"
                          onClick={() => {
                            setSelectedAspect(asp.aspectName);
                            setAspectPolarity("positive");
                            setActiveTab("reviews");
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-emerald-500 tabular-nums cursor-pointer"
                        >
                          <span className="capitalize">{asp.aspectName}</span> · {asp.positivePercent}% pos
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-400 block">
                      Documented Buyer Complaints (Click to jump to reviews)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {criticalAspects.map((asp) => (
                        <button
                          key={asp.aspectName}
                          type="button"
                          onClick={() => {
                            setSelectedAspect(asp.aspectName);
                            setAspectPolarity("negative");
                            setActiveTab("reviews");
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-rose-500 tabular-nums cursor-pointer"
                        >
                          <span className="capitalize">{asp.aspectName}</span> · {asp.negativePercent}% neg
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 3: GEMINI + GOOGLE SEARCH GROUNDING CLAIM FACT-CHECK
             ===================================================================== */}
          {activeTab === "factcheck" && (
            <div className="space-y-5">
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Cross-Verify Buyer Claims Against Specs & Web Sources
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
                    Evaluates battery, thermal, display, and build claims from this product&apos;s reviews using Gemini Google Search Grounding when active, or cross-checks published specifications and audited buyer sentiment locally.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={claimLoading}
                  onClick={handleVerifyClaims}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {claimLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {claimLoading
                    ? "Evaluating Buyer Claims..."
                    : claimReport
                      ? "Re-Run Claim Fact-Check"
                      : "Verify Buyer Claims"}
                </button>
              </div>

              {claimError && (
                <p className="text-xs text-rose-700 dark:text-rose-400">{claimError}</p>
              )}

              {claimReport ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Engine:{" "}
                        <strong className="font-mono text-slate-800 dark:text-slate-200">
                          {claimReport.model}
                        </strong>{" "}
                        ·{" "}
                        {claimReport.grounded
                          ? "Grounded with Live Google Search"
                          : "Local Spec & Review Sentiment Cross-Check"}
                      </span>
                      <span className="font-mono tabular-nums">
                        {new Date(claimReport.checkedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                      {claimReport.summary}
                    </p>
                    {!claimReport.grounded &&
                      (claimReport.fallbackReason === "missing_api_key" ||
                        claimReport.fallbackReason === "invalid_api_key") && (
                        <p className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                          Live Google Search grounding is inactive — set a valid{" "}
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            GEMINI_API_KEY
                          </span>{" "}
                          in <strong className="font-semibold text-slate-700 dark:text-slate-200">Settings &gt; Secrets</strong>{" "}
                          to attach live web search citations.
                        </p>
                      )}
                    {!claimReport.grounded &&
                      (claimReport.fallbackReason === "quota_exceeded" ||
                        claimReport.fallbackReason === "service_unavailable") && (
                        <p className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                          Live Google Search grounding is momentarily rate-limited — showing deterministic specification and buyer sentiment cross-check.
                        </p>
                      )}
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                    {claimReport.claims.map((item, idx) => (
                      <div key={idx} className="p-4 space-y-1 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm text-slate-900 dark:text-white">
                            {item.claim}
                          </strong>
                          <span
                            className={`font-semibold uppercase tracking-wider text-[11px] ${
                              item.verdict === "corroborated"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : item.verdict === "disputed"
                                  ? "text-rose-700 dark:text-rose-400"
                                  : "text-amber-700 dark:text-amber-400"
                            }`}
                          >
                            {item.verdict}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.evidenceSummary}
                        </p>
                      </div>
                    ))}
                  </div>

                  {claimReport.sources.length > 0 && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                        {claimReport.grounded
                          ? "Grounded Web Citations & Official Sources:"
                          : "Verified Marketplace & Official Spec Sources:"}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {claimReport.sources.map((src, idx) => (
                          <a
                            key={idx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-amber-400 hover:border-amber-400 inline-flex items-center gap-1.5 font-medium"
                          >
                            <span className="truncate max-w-[240px]">{src.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Click &ldquo;Verify Buyer Claims&rdquo; above to cross-examine this product&apos;s buyer claims against hardware specs, review sentiment, and web sources.
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 4: FULL PRODUCT DESCRIPTION & TECHNICAL SPECIFICATIONS
             ===================================================================== */}
          {activeTab === "specs" && (
            <div className="space-y-5">
              {product.description && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Product Overview
                  </h3>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {product.description}
                  </p>
                </div>
              )}

              {specEntries.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Verified Hardware Specifications
                  </h3>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {specEntries.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-3 px-4 py-2.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">{key}</span>
                        <span className="col-span-2 text-slate-900 dark:text-slate-100 font-medium">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
