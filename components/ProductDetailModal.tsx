"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  ExternalLink,
  Star,
  ShieldCheck,
  ShieldAlert,
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
  SlidersHorizontal,
  Info,
  CheckCircle2,
} from "lucide-react";
import type { ProductClusterForensics } from "@/lib/forensics";
import type { ProductClaimVerificationReport } from "@/lib/gemini";
import type { ProductRecord, ReviewRecord } from "@/lib/types";
import { extractStoreLabel } from "@/lib/links";
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
type ReviewClassificationTab = "all" | "genuine" | "suspicious" | "needs_review";
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

  // Redesigned Review Dashboard State
  const [reviewTab, setReviewTab] = useState<ReviewClassificationTab>("all");
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Secondary Collapsible Filters
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("all");
  const [selectedStar, setSelectedStar] = useState<number | "all">("all");
  const [selectedAspect, setSelectedAspect] = useState<string>("all");
  const [aspectPolarity, setAspectPolarity] = useState<AspectPolarityFilter>("all");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewSort, setReviewSort] = useState<ReviewSortOption>("helpful");
  const [expandedAnalysis, setExpandedAnalysis] = useState<Record<string, boolean>>({});

  // Submit review state
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [revTitle, setRevTitle] = useState("");
  const [revText, setRevText] = useState("");
  const [revName, setRevName] = useState("");
  const [revRating, setRevRating] = useState(5);
  const [revSourceType, setRevSourceType] = useState<"site_user" | "user_pasted">("site_user");
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const resetFilters = () => {
    setReviewTab("all");
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
    resetFilters();
    setExpandedAnalysis({});
    setClaimReport(null);
    setClaimError(null);
    setClusterForensics(null);
    setSubmitStatus(null);
    setShowWriteForm(false);
    setIsDetailsOpen(false);
    setIsMoreFiltersOpen(false);

    const hasPreloaded = Boolean(initialReviews && initialReviews.length > 0);
    setReviews(initialReviews ?? []);
    setReviewAnalyses(initialReviewAnalyses ?? {});
    setSummary(initialSummary ?? null);

    fetchProductBundle(product.id, !hasPreloaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Compute 3 core summary metrics and review classification stats from actual data
  const reviewMetrics = useMemo(() => {
    let rawStarSum = 0;
    let cleanStarSum = 0;
    let genuineCount = 0;
    let suspiciousCount = 0;
    let needsReviewCount = 0;
    let verifiedCount = 0;

    for (const rev of reviews) {
      rawStarSum += rev.rating;
      if (rev.verifiedPurchase) verifiedCount += 1;

      const ana = reviewAnalyses[rev.id];
      const risk = ana?.authenticityRisk ?? 0.1;
      const mismatch = ana?.riskBreakdown?.ratingMismatch ?? 0;

      const isSuspicious = risk >= 0.5 || mismatch >= 0.3;
      const isNeedsReview = !isSuspicious && (risk >= 0.25 || !rev.verifiedPurchase);

      if (isSuspicious) {
        suspiciousCount += 1;
      } else if (isNeedsReview) {
        needsReviewCount += 1;
      } else {
        genuineCount += 1;
        cleanStarSum += rev.rating;
      }
    }

    const total = reviews.length;
    const rawAvg = total > 0 ? rawStarSum / total : product?.rating ?? 0;
    const genuineAvg = genuineCount > 0 ? cleanStarSum / genuineCount : rawAvg;
    const flaggedCount = suspiciousCount + needsReviewCount;

    const genuinePct = total > 0 ? Math.round((genuineCount / total) * 100) : 100;
    const flaggedPct = total > 0 ? Math.round((flaggedCount / total) * 100) : 0;

    return {
      total,
      rawAvg,
      genuineAvg,
      genuineCount,
      genuinePct,
      suspiciousCount,
      needsReviewCount,
      flaggedCount,
      flaggedPct,
      verifiedCount,
      unverifiedCount: total - verifiedCount,
    };
  }, [reviews, reviewAnalyses, product?.rating]);

  // Segregate aspects into Praise vs Complaints
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

  const activeSecondaryFilterCount = useMemo(() => {
    let count = 0;
    if (verifiedFilter !== "all") count += 1;
    if (selectedStar !== "all") count += 1;
    if (selectedAspect !== "all") count += 1;
    if (aspectPolarity !== "all") count += 1;
    return count;
  }, [verifiedFilter, selectedStar, selectedAspect, aspectPolarity]);

  // Filtered reviews using the 4 mutually exclusive tabs + secondary filters + search + sort
  const filteredReviews = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();

    const result = reviews.filter((rev) => {
      const ana = reviewAnalyses[rev.id];
      const risk: number = ana?.authenticityRisk ?? 0.1;
      const mismatch: number = ana?.riskBreakdown?.ratingMismatch ?? 0;

      const isSuspicious = risk >= 0.5 || mismatch >= 0.3;
      const isNeedsReview = !isSuspicious && (risk >= 0.25 || !rev.verifiedPurchase);
      const isGenuine = !isSuspicious && !isNeedsReview;

      // 1. Core 4-Tab Filter
      if (reviewTab === "genuine" && !isGenuine) return false;
      if (reviewTab === "suspicious" && !isSuspicious) return false;
      if (reviewTab === "needs_review" && !isNeedsReview) return false;

      // 2. Secondary Collapsible Filters
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

      // 3. Search Query Filter
      if (query) {
        const signalText = (ana?.reasoningSignals ?? []).join(" ").toLowerCase();
        const aspectText = (ana?.aspects ?? []).map((a: any) => a.name).join(" ").toLowerCase();
        const haystack =
          `${rev.reviewTitle ?? ""} ${rev.reviewText} ${rev.reviewerName ?? ""} ${signalText} ${aspectText}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    return [...result].sort((a, b) => {
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
    reviewTab,
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
          ? "Analyzed and saved in review snapshot (pasted text is analyzed privately)."
          : "Customer review submitted, analyzed by ReviewLens, and added to the review dashboard!",
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
      summaryMetrics: {
        totalReviews: reviewMetrics.total,
        rawAverageRating: Number(reviewMetrics.rawAvg.toFixed(2)),
        genuineAdjustedRating: Number(reviewMetrics.genuineAvg.toFixed(2)),
        likelyGenuineCount: reviewMetrics.genuineCount,
        flaggedCount: reviewMetrics.flaggedCount,
        suspiciousCount: reviewMetrics.suspiciousCount,
        needsReviewCount: reviewMetrics.needsReviewCount,
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

  const toggleAnalysis = (revId: string) => {
    setExpandedAnalysis((prev) => ({ ...prev, [revId]: !prev[revId] }));
  };

  const specEntries = Object.entries(product.specs ?? {});
  const forensicSignalCount =
    (clusterForensics?.crossProductReviewers.length ?? 0) +
    (clusterForensics?.duplicatePairs.length ?? 0) +
    (clusterForensics?.dateBursts.length ?? 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl my-3 sm:my-6 overflow-hidden text-slate-100"
      >
        {/* =====================================================================
            1. SIMPLIFIED PRODUCT HEADER (Requirements 1 & 8)
           ===================================================================== */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-900/90 relative">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product view"
            className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pr-8">
            {/* Image */}
            <div className="md:col-span-4 lg:col-span-3">
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
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

            {/* Title, Rating, Price, Store Links */}
            <div className="md:col-span-8 lg:col-span-9 space-y-3">
              <div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">
                  {product.brand ?? product.category ?? "Electronics"}
                </span>
                <h1 className="text-lg sm:text-2xl font-bold text-white leading-snug">
                  {product.productName}
                </h1>

                {/* Rating & Review Count */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-300 mt-2 tabular-nums">
                  <span className="inline-flex items-center gap-1 font-bold text-white">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {product.rating?.toFixed(1) ?? "N/A"}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-300">
                    {(product.reviewCount ?? reviews.length).toLocaleString("en-IN")} overall ratings
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-emerald-400 font-semibold">
                    {reviewMetrics.genuineAvg.toFixed(1)}★ Genuine Adjusted
                  </span>
                </div>
              </div>

              {/* Price & Primary Storefront Links */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-baseline gap-2.5 tabular-nums">
                  <span className="text-2xl font-bold text-white">
                    {product.price !== null
                      ? `₹${product.price.toLocaleString("en-IN")}`
                      : "Check Marketplace"}
                  </span>
                  {product.mrp && product.price && product.mrp > product.price && (
                    <>
                      <span className="text-xs text-slate-500 line-through">
                        MRP ₹{product.mrp.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        ({product.discountPercent}% off)
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Primary Storefront Link */}
                  {product.sourceUrl && (
                    <a
                      href={product.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      {extractStoreLabel(product.sourceUrl, product.source)} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Flipkart Link */}
                  <a
                    href={`https://www.flipkart.com/search?q=${encodeURIComponent(
                      `${product.brand ?? ""} ${product.model ?? product.productName}`.trim(),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    Flipkart <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {/* Compact Details & Actions Toggle Menu (Requirement 1) */}
                  <button
                    type="button"
                    onClick={() => setIsDetailsOpen((prev) => !prev)}
                    className="px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5 text-amber-400" />
                    <span>More Details</span>
                    {isDetailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Collapsible Secondary Details & Actions Menu */}
              {isDetailsOpen && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-slate-400">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        Identifier:{" "}
                        <strong className="font-mono text-slate-200">
                          {product.source === "amazon.in" ? "ASIN:" : product.source === "flipkart" ? "PID:" : "ID:"}{" "}
                          {product.externalId}
                        </strong>
                      </span>
                      <span>·</span>
                      <span className="text-emerald-400 font-medium">
                        {product.verificationLevel === "verified"
                          ? "Verified Marketplace Identity"
                          : "Link Inspected"}
                      </span>
                      {product.officialUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={product.officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 hover:underline inline-flex items-center gap-1"
                          >
                            Official Website <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleCompare(product.id)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {isCompared ? (
                          <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                        {isCompared ? "Comparing" : "Compare"}
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleShortlist(product.id)}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isShortlisted
                            ? "border-rose-800 bg-rose-950/60 text-rose-400"
                            : "border-slate-700 bg-slate-800 text-slate-300"
                        }`}
                        title="Shortlist product"
                      >
                        <Heart className={`w-4 h-4 ${isShortlisted ? "fill-rose-400" : ""}`} />
                      </button>

                      <button
                        type="button"
                        onClick={handleExportProductAudit}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Export Audit JSON
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="px-6 bg-slate-950/60 border-b border-slate-800 flex items-center gap-6 overflow-x-auto text-xs font-semibold tabular-nums">
          {(
            [
              { id: "reviews", label: `Review Dashboard (${reviews.length})` },
              {
                id: "forensics",
                label:
                  forensicSignalCount > 0
                    ? `Forensic Signals (${forensicSignalCount} alerts)`
                    : "Forensic Signals",
              },
              { id: "factcheck", label: "Claim Fact-Check" },
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
                    ? "border-amber-400 text-amber-400 font-bold"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* =====================================================================
              TAB 1: PRODUCT REVIEW DASHBOARD (MAIN REDESIGN)
             ===================================================================== */}
          {activeTab === "reviews" && (
            <div className="space-y-6">
              {/* -----------------------------------------------------------------
                  2. THREE CORE SUMMARY METRICS CARDS (Requirement 2)
                 ----------------------------------------------------------------- */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Metric 1: Adjusted Rating */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Adjusted Genuine Rating</span>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-2xl sm:text-3xl font-bold text-amber-400">
                        {reviewMetrics.genuineAvg.toFixed(1)}★
                      </span>
                      <span className="text-xs text-slate-400">
                        vs {reviewMetrics.rawAvg.toFixed(1)}★ raw
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Recalculated after isolating promotional patterns & mismatches.
                    </p>
                  </div>
                </div>

                {/* Metric 2: Likely Genuine Reviews */}
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between text-xs text-emerald-400">
                    <span className="font-medium">Likely Genuine Reviews</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-2xl sm:text-3xl font-bold text-emerald-400">
                        {reviewMetrics.genuineCount}
                      </span>
                      <span className="text-xs text-emerald-400/80 font-medium">
                        ({reviewMetrics.genuinePct}% of total)
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-400/70 mt-1">
                      Natural language structure, verified purchase & consistent sentiment.
                    </p>
                  </div>
                </div>

                {/* Metric 3: Flagged for Further Inspection */}
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between text-xs text-amber-400">
                    <span className="font-medium">Flagged for Inspection</span>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-2xl sm:text-3xl font-bold text-amber-400">
                        {reviewMetrics.flaggedCount}
                      </span>
                      <span className="text-xs text-amber-400/80 font-medium">
                        ({reviewMetrics.flaggedPct}% of total)
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-400/70 mt-1">
                      Includes {reviewMetrics.suspiciousCount} suspicious patterns & {reviewMetrics.needsReviewCount} unverified/borderline items.
                    </p>
                  </div>
                </div>
              </div>

              {/* -----------------------------------------------------------------
                  3. FOUR CLEAR CATEGORY TABS (Requirement 3)
                 ----------------------------------------------------------------- */}
              <div className="border-b border-slate-800 pb-1">
                <div className="flex items-center gap-2 overflow-x-auto text-xs font-semibold tabular-nums">
                  {(
                    [
                      { id: "all", label: "All Reviews", count: reviewMetrics.total, badgeCls: "bg-slate-800 text-slate-300" },
                      { id: "genuine", label: "Genuine", count: reviewMetrics.genuineCount, badgeCls: "bg-emerald-500/20 text-emerald-400" },
                      { id: "suspicious", label: "Suspicious", count: reviewMetrics.suspiciousCount, badgeCls: "bg-rose-500/20 text-rose-400" },
                      { id: "needs_review", label: "Needs Review", count: reviewMetrics.needsReviewCount, badgeCls: "bg-amber-500/20 text-amber-400" },
                    ] as { id: ReviewClassificationTab; label: string; count: number; badgeCls: string }[]
                  ).map((tab) => {
                    const active = reviewTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setReviewTab(tab.id)}
                        className={`px-3.5 py-2 rounded-xl inline-flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                          active
                            ? "bg-amber-400 text-slate-950 font-bold shadow-sm"
                            : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
                            active ? "bg-slate-950/20 text-slate-950 font-bold" : tab.badgeCls
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* -----------------------------------------------------------------
                  4. SINGLE SEARCH BAR & SORT + COLLAPSIBLE "MORE FILTERS" (Requirement 4)
                 ----------------------------------------------------------------- */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Single Main Search Bar */}
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={reviewQuery}
                      onChange={(e) => setReviewQuery(e.target.value)}
                      placeholder="Search reviews by keyword, topic, or reviewer..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    {reviewQuery && (
                      <button
                        type="button"
                        onClick={() => setReviewQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Sort Dropdown */}
                    <select
                      value={reviewSort}
                      onChange={(e) => setReviewSort(e.target.value as ReviewSortOption)}
                      aria-label="Sort reviews"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                    >
                      <option value="helpful">Sort: Most Helpful</option>
                      <option value="authentic_first">Sort: Genuine First</option>
                      <option value="suspicious_first">Sort: Suspicious First</option>
                      <option value="mismatch_first">Sort: Star Mismatch First</option>
                      <option value="newest">Sort: Newest First</option>
                      <option value="rating_high">Sort: Highest Stars</option>
                      <option value="rating_low">Sort: Lowest Stars</option>
                    </select>

                    {/* Collapsible More Filters Button */}
                    <button
                      type="button"
                      onClick={() => setIsMoreFiltersOpen((prev) => !prev)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        activeSecondaryFilterCount > 0 || isMoreFiltersOpen
                          ? "bg-amber-400/10 border-amber-400/40 text-amber-400"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>More Filters</span>
                      {activeSecondaryFilterCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-400 text-slate-950 font-bold">
                          {activeSecondaryFilterCount}
                        </span>
                      )}
                      {isMoreFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {/* Write Review Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowWriteForm((v) => !v)}
                      className="px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showWriteForm ? "Hide Form" : "Write / Paste Review"}
                    </button>
                  </div>
                </div>

                {/* Collapsible "More Filters" Panel */}
                {isMoreFiltersOpen && (
                  <div className="pt-3 border-t border-slate-800 space-y-3 text-xs animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Star Rating Selector */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Filter by Stars
                        </label>
                        <select
                          value={selectedStar === "all" ? "all" : String(selectedStar)}
                          onChange={(e) =>
                            setSelectedStar(e.target.value === "all" ? "all" : Number(e.target.value))
                          }
                          aria-label="Filter by star rating"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                        >
                          <option value="all">All Stars</option>
                          {[5, 4, 3, 2, 1].map((s) => (
                            <option key={s} value={s}>
                              {s}★ Only
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Verified Purchase Status */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Purchase Verification
                        </label>
                        <select
                          value={verifiedFilter}
                          onChange={(e) => setVerifiedFilter(e.target.value as VerifiedFilter)}
                          aria-label="Filter by verified purchase"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                        >
                          <option value="all">All Buyers ({reviewMetrics.total})</option>
                          <option value="verified">Verified Purchases Only ({reviewMetrics.verifiedCount})</option>
                          <option value="unverified">Unverified Purchases ({reviewMetrics.unverifiedCount})</option>
                        </select>
                      </div>

                      {/* Reset Secondary Filters */}
                      <div className="flex items-end">
                        {activeSecondaryFilterCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setVerifiedFilter("all");
                              setSelectedStar("all");
                              setSelectedAspect("all");
                              setAspectPolarity("all");
                            }}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Secondary Filters ({activeSecondaryFilterCount})
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 py-1">No extra filters applied</span>
                        )}
                      </div>
                    </div>

                    {/* Topic / Aspect Filters */}
                    {allAspects.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/60">
                        <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
                          Filter by Hardware Topic:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAspect("all");
                              setAspectPolarity("all");
                            }}
                            className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${
                              selectedAspect === "all"
                                ? "bg-amber-400 text-slate-950 border-amber-400 font-bold"
                                : "bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500"
                            }`}
                          >
                            All Topics
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
                                className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer tabular-nums ${
                                  isSelected
                                    ? "bg-amber-400 text-slate-950 border-amber-400 font-bold"
                                    : "bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500"
                                }`}
                              >
                                <span className="capitalize">{asp.aspectName}</span> ({asp.mentionCount})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Form to submit review */}
              {showWriteForm && (
                <form
                  onSubmit={handleAddReview}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Your name (optional)"
                      value={revName}
                      onChange={(e) => setRevName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    <select
                      value={revRating}
                      onChange={(e) => setRevRating(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
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
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                    >
                      <option value="site_user">Public Verified Review</option>
                      <option value="user_pasted">Private Pasted Audit</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Review headline"
                    value={revTitle}
                    onChange={(e) => setRevTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <textarea
                    rows={3}
                    required
                    placeholder="Share concrete usage details (battery, thermals, build quality, pros & cons)..."
                    value={revText}
                    onChange={(e) => setRevText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  {submitStatus && (
                    <p className="text-xs text-emerald-400 font-medium">{submitStatus}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {submitting ? "Analyzing & Saving..." : "Submit Review"}
                    </button>
                  </div>
                </form>
              )}

              {/* Status Header Line */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 tabular-nums">
                <span>
                  Showing <strong className="text-white">{filteredReviews.length}</strong> of{" "}
                  <strong className="text-white">{reviews.length}</strong> reviews
                </span>
                {(reviewTab !== "all" || activeSecondaryFilterCount > 0 || reviewQuery) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-amber-400 hover:underline font-medium cursor-pointer"
                  >
                    Reset all filters
                  </button>
                )}
              </div>

              {/* -----------------------------------------------------------------
                  5 & 6. SIMPLIFIED REVIEW CARDS + EXPANDABLE ANALYSIS (Req 5, 6, 7 & 9)
                 ----------------------------------------------------------------- */}
              {loading && reviews.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                  Loading product customer reviews...
                </div>
              ) : filteredReviews.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl space-y-2">
                  <p>No reviews match the current selection.</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-amber-400 font-semibold hover:underline cursor-pointer"
                  >
                    Clear review filters
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReviews.map((rev) => {
                    const ana = reviewAnalyses[rev.id];
                    const risk: number = ana?.authenticityRisk ?? 0.1;
                    const mismatch: number = ana?.riskBreakdown?.ratingMismatch ?? 0;
                    const isSuspicious = risk >= 0.5 || mismatch >= 0.3;
                    const isNeedsReview = !isSuspicious && (risk >= 0.25 || !rev.verifiedPurchase);

                    const isAnalysisOpen = Boolean(expandedAnalysis[rev.id]);

                    return (
                      <div
                        key={rev.id}
                        className="p-4 sm:p-5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 transition-all space-y-3"
                      >
                        {/* Requirement 5: Clean Review Card Face Header */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            {/* Stars & Title */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center text-amber-400 shrink-0">
                                {[...Array(5)].map((_, idx) => (
                                  <Star
                                    key={idx}
                                    className={`w-3.5 h-3.5 ${
                                      idx < rev.rating ? "fill-amber-400 text-amber-400" : "text-slate-700"
                                    }`}
                                  />
                                ))}
                              </div>
                              <h4 className="text-sm font-semibold text-white">
                                {rev.reviewTitle ?? "Customer Review"}
                              </h4>
                            </div>

                            {/* Reviewer, Date, Verified Badge */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                              <span className="font-medium text-slate-200">
                                {rev.reviewerName ?? "Verified Shopper"}
                              </span>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span>{rev.reviewDate ?? "Recent"}</span>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              {rev.verifiedPurchase ? (
                                <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  Verified Purchase
                                </span>
                              ) : (
                                <span className="text-slate-500">Unverified Purchase</span>
                              )}
                            </div>
                          </div>

                          {/* Requirement 5: ONE CONCISE AUTHENTICITY INDICATOR */}
                          <div>
                            {isSuspicious ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Suspicious Pattern</span>
                              </span>
                            ) : isNeedsReview ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Needs Review</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Likely Genuine</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Review Body Text */}
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                          {rev.reviewText}
                        </p>

                        {/* Requirement 6: EXPANDABLE VIEW ANALYSIS ACTION */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                          <div className="flex items-center gap-3 text-slate-400">
                            {rev.helpfulVotes ? (
                              <span className="inline-flex items-center gap-1">
                                <ThumbsUp className="w-3 h-3 text-slate-400" /> {rev.helpfulVotes} found helpful
                              </span>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleAnalysis(rev.id)}
                            className="text-xs font-semibold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isAnalysisOpen ? "Hide Analysis" : "View Analysis"}</span>
                            {isAnalysisOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Requirement 6: EXPANDABLE "VIEW ANALYSIS" FORENSIC SECTION */}
                        {isAnalysisOpen && (
                          <div className="mt-3 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
                              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                                <span className="text-slate-400 text-[11px] block font-sans">
                                  Linguistic Heuristics
                                </span>
                                <strong className="text-sm text-white font-semibold">
                                  {Math.round((ana?.riskBreakdown?.heuristicRisk ?? risk) * 100)}% risk
                                </strong>
                              </div>
                              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                                <span className="text-slate-400 text-[11px] block font-sans">
                                  Gemini Text Analysis
                                </span>
                                <strong className="text-sm text-white font-semibold">
                                  {Math.round((ana?.riskBreakdown?.geminiRisk ?? risk) * 100)}% risk
                                </strong>
                              </div>
                              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                                <span className="text-slate-400 text-[11px] block font-sans">
                                  Star-Text Mismatch
                                </span>
                                <strong
                                  className={`text-sm font-semibold ${
                                    mismatch >= 0.3 ? "text-amber-400" : "text-white"
                                  }`}
                                >
                                  {Math.round(mismatch * 100)}% penalty
                                </strong>
                              </div>
                            </div>

                            {/* Analysis Signals & Aspects */}
                            <div className="space-y-2 pt-1 border-t border-slate-800/80">
                              <div>
                                <span className="text-slate-400 font-semibold block mb-1">
                                  Detected Forensic Signals:
                                </span>
                                <p className="text-slate-300">
                                  {ana?.reasoningSignals?.length > 0
                                    ? ana.reasoningSignals.join(" · ")
                                    : "Standard organic review structure with no template cloning."}
                                </p>
                              </div>

                              {ana?.aspects?.length > 0 && (
                                <div>
                                  <span className="text-slate-400 font-semibold block mb-1">
                                    Extracted Aspects:
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ana.aspects.map((asp: any, idx: number) => (
                                      <span
                                        key={idx}
                                        className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                          asp.sentiment === "positive"
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : asp.sentiment === "negative"
                                              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                              : "bg-slate-800 border-slate-700 text-slate-300"
                                        }`}
                                      >
                                        <span className="capitalize">{asp.name}</span>: {asp.sentiment}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
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
              TAB 2: FORENSIC SIGNALS & CLUSTER OVERLAP (Requirement 8)
             ===================================================================== */}
          {activeTab === "forensics" && (
            <div className="space-y-6">
              {/* Star Score vs Adjusted Score */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-950/60 border border-slate-800 rounded-xl p-5">
                <div className="lg:col-span-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 pb-4 lg:pb-0 lg:pr-5 tabular-nums">
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block mb-2">
                      Genuine-Adjusted Star Score
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold text-amber-400">
                        {reviewMetrics.genuineAvg.toFixed(1)}★
                      </span>
                      <span className="text-xs text-slate-400">
                        vs <strong className="text-slate-200">{reviewMetrics.rawAvg.toFixed(1)}★</strong> raw
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Calculated from{" "}
                      <strong className="text-slate-200">
                        {reviewMetrics.genuineCount} of {reviews.length}
                      </strong>{" "}
                      reviews after isolating promotional patterns and star mismatches.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-8 space-y-2.5 tabular-nums">
                  <span className="text-xs font-semibold text-slate-200 block">
                    True Prose Sentiment Breakdown
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 text-xs block">Likely Genuine</span>
                      <span className="text-xl font-bold text-emerald-400">
                        {reviewMetrics.genuineCount} ({reviewMetrics.genuinePct}%)
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 text-xs block">Flagged Patterns</span>
                      <span className="text-xl font-bold text-amber-400">
                        {reviewMetrics.flaggedCount} ({reviewMetrics.flaggedPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cross-Product Shill-Ring Overlap */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-800 rounded-xl p-4 space-y-3 bg-slate-950/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">
                      Cross-Product Reviewer Overlap (Shill Graph)
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {clusterForensics?.crossProductReviewers.length ?? 0} recurring handles
                    </span>
                  </div>
                  {clusterForensics?.crossProductReviewers.length ? (
                    <div className="space-y-2 text-xs">
                      {clusterForensics.crossProductReviewers.map((entry) => (
                        <div
                          key={entry.reviewerName}
                          className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1 tabular-nums"
                        >
                          <div className="flex items-center justify-between">
                            <strong className="font-mono text-rose-400">
                              {entry.reviewerName}
                            </strong>
                            <span className="text-slate-400">
                              Posted on {entry.otherProductCount} other catalog items
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      No cross-product shill reviewer handles detected on this product.
                    </p>
                  )}
                </div>

                <div className="border border-slate-800 rounded-xl p-4 space-y-3 bg-slate-950/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">
                      3-Gram Shingle Jaccard & Date Burst Audit
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">
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
                          className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex justify-between font-semibold text-amber-400"
                        >
                          <span>{pair.reviewerA} ↔ {pair.reviewerB}</span>
                          <span>{Math.round(pair.jaccardSimilarity * 100)}% 3-gram overlap</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Review timestamps and 3-gram phrasing show organic dispersion with zero template cloning.
                    </p>
                  )}
                </div>
              </div>

              {/* Praise vs Complaints */}
              {(praisedAspects.length > 0 || criticalAspects.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-800 rounded-xl p-4 space-y-2.5 bg-slate-950/60">
                    <span className="text-xs font-bold text-emerald-400 block">
                      What Genuine Buyers Praise
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
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-200 hover:border-emerald-500 cursor-pointer"
                        >
                          <span className="capitalize">{asp.aspectName}</span> · {asp.positivePercent}% pos
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-slate-800 rounded-xl p-4 space-y-2.5 bg-slate-950/60">
                    <span className="text-xs font-bold text-rose-400 block">
                      Documented Buyer Complaints
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
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-200 hover:border-rose-500 cursor-pointer"
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
              TAB 3: BUYER CLAIM FACT-CHECK
             ===================================================================== */}
          {activeTab === "factcheck" && (
            <div className="space-y-5">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white inline-flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-400" />
                    Cross-Verify Buyer Claims Against Specs & Web Sources
                  </h3>
                  <p className="text-xs text-slate-300 max-w-2xl">
                    Evaluates battery, thermal, display, and build claims from this product&apos;s reviews using Gemini Google Search Grounding or hardware specs.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={claimLoading}
                  onClick={handleVerifyClaims}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {claimLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {claimLoading ? "Evaluating..." : claimReport ? "Re-Run Fact-Check" : "Verify Buyer Claims"}
                </button>
              </div>

              {claimError && <p className="text-xs text-rose-400">{claimError}</p>}

              {claimReport ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-2">
                    <p className="text-sm text-slate-100 leading-relaxed">{claimReport.summary}</p>
                  </div>

                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900">
                    {claimReport.claims.map((item, idx) => (
                      <div key={idx} className="p-4 space-y-1 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm text-white">{item.claim}</strong>
                          <span
                            className={`font-semibold uppercase tracking-wider text-[11px] ${
                              item.verdict === "corroborated"
                                ? "text-emerald-400"
                                : item.verdict === "disputed"
                                  ? "text-rose-400"
                                  : "text-amber-400"
                            }`}
                          >
                            {item.verdict}
                          </span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">{item.evidenceSummary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                  Click &ldquo;Verify Buyer Claims&rdquo; to cross-examine claims against specs and sources.
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 4: SPECIFICATIONS
             ===================================================================== */}
          {activeTab === "specs" && (
            <div className="space-y-5">
              {product.description && (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-400 mb-1.5">Product Overview</h3>
                  <p className="text-sm text-slate-200 leading-relaxed">{product.description}</p>
                </div>
              )}

              {specEntries.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 mb-2">Hardware Specifications</h3>
                  <div className="border border-slate-800 rounded-xl divide-y divide-slate-800 text-xs">
                    {specEntries.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-3 px-4 py-2.5">
                        <span className="text-slate-400 font-medium">{key}</span>
                        <span className="col-span-2 text-slate-100 font-medium">{String(value)}</span>
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
