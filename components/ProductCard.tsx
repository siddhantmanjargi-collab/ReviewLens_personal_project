"use client";

import React from "react";
import { motion } from "motion/react";
import { Star, Heart, CheckSquare, Square, ShieldCheck, AlertTriangle, ExternalLink } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { extractStoreLabel } from "@/lib/links";
import { ProductArtwork } from "./ProductArtwork";

export interface ProductSnapshotSummary {
  asOf: string;
  reviewsAnalyzed: number;
  sentimentPercentages?: { positive: number; neutral: number; negative: number };
  authenticityDistribution?: Record<string, number>;
  details?: {
    averageRisk?: number;
    rawAverageRating?: number;
    genuineAverageRating?: number;
    ratingDelta?: number;
  };
  aspects?: {
    aspectName: string;
    mentionCount: number;
    positiveCount?: number;
    negativeCount?: number;
    positivePercent: number;
    negativePercent: number;
  }[];
}

interface ProductCardProps {
  product: ProductRecord;
  snapshot: ProductSnapshotSummary | null;
  reviewCountLoaded?: number;
  viewMode: "grid" | "list";
  isCompared: boolean;
  isShortlisted: boolean;
  onSelect: (p: ProductRecord) => void;
  onToggleCompare: (id: string) => void;
  onToggleShortlist: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  snapshot,
  reviewCountLoaded,
  viewMode,
  isCompared,
  isShortlisted,
  onSelect,
  onToggleCompare,
  onToggleShortlist,
}) => {
  const avgRisk = snapshot?.details?.averageRisk ?? 0.14;
  const genuineScore = Math.max(0, Math.min(100, Math.round((1 - avgRisk) * 100)));
  const isFlagged = avgRisk >= 0.25;
  const topPro = snapshot?.aspects?.find((a) => a.positivePercent >= 60)?.aspectName;
  const specList = Object.entries(product.specs ?? {}).slice(0, 4);
  const auditedCount = reviewCountLoaded ?? snapshot?.reviewsAnalyzed ?? 6;
  const storeLabel = extractStoreLabel(product.sourceUrl, product.source);

  if (viewMode === "list") {
    return (
      <motion.article
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-5 flex flex-col md:flex-row gap-6 transition-all hover:shadow-md"
      >
        {/* Left: Product Artwork + Compare */}
        <div className="w-full md:w-56 shrink-0 flex flex-col gap-3">
          <div
            onClick={() => onSelect(product)}
            className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 cursor-pointer"
          >
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
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => onToggleCompare(product.id)}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isCompared ? (
                <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              )}
              <span>Add to Compare</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleShortlist(product.id)}
              aria-label="Toggle shortlist"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                isShortlisted
                  ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Heart className={`w-4 h-4 ${isShortlisted ? "fill-rose-600 dark:fill-rose-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Center: Product Details & Key Specs (Flipkart horizontal format) */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-200">{product.brand ?? "Marketplace"}</span>
              <span aria-hidden="true">·</span>
              <span>{product.category ?? "Electronics"}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{product.externalId}</span>
            </div>

            <h3
              onClick={() => onSelect(product)}
              className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors cursor-pointer leading-snug mb-2"
            >
              {product.productName}
            </h3>

            {/* Star Rating + Review Count */}
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mb-3 tabular-nums">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                {product.rating?.toFixed(1) ?? "N/A"}
              </span>
              <span aria-hidden="true">·</span>
              <span>{(product.reviewCount ?? 0).toLocaleString("en-IN")} ratings</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {auditedCount} audited reviews
              </span>
            </div>

            {/* Bullet Specifications */}
            {specList.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {specList.map(([k, v]) => (
                  <li key={k} className="truncate">
                    <span className="text-slate-400 dark:text-slate-500 mr-1.5">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{k}:</span>{" "}
                    <span className="text-slate-800 dark:text-slate-100 font-medium">{String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Price Block & ReviewLens Snapshot */}
        <div className="w-full md:w-60 shrink-0 md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-6 flex flex-col justify-between gap-4">
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {product.price !== null ? `₹${product.price.toLocaleString("en-IN")}` : "Check Price"}
            </div>
            {product.mrp && product.price && product.mrp > product.price && (
              <div className="flex items-center gap-2 text-xs mt-0.5 tabular-nums">
                <span className="text-slate-400 dark:text-slate-500 line-through">
                  ₹{product.mrp.toLocaleString("en-IN")}
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {product.discountPercent}% off
                </span>
              </div>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {product.availability ?? "In Stock"}
            </div>

            {/* ReviewLens Intelligence Line */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                {isFlagged ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400 tabular-nums">
                      {Math.round(avgRisk * 100)}% Suspicion Risk
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {genuineScore}% Genuine Pattern
                    </span>
                  </>
                )}
              </div>
              {topPro && (
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  Top buyer praise:{" "}
                  <span className="text-slate-700 dark:text-slate-200 font-medium">{topPro}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onSelect(product)}
              className="w-full py-2 px-4 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              Read {auditedCount} Reviews & Specs
            </button>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              {product.sourceUrl && (
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white font-medium whitespace-nowrap"
                >
                  {storeLabel} <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {product.officialUrl && (
                <a
                  href={product.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                >
                  {product.brand ?? "Official"} Site <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.article>
    );
  }

  // Standard Storefront Grid Card
  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl overflow-hidden flex flex-col justify-between transition-all hover:shadow-md"
    >
      <div>
        {/* 4:3 Studio Product Visual */}
        <div
          onClick={() => onSelect(product)}
          className="relative aspect-[4/3] w-full border-b border-slate-100 dark:border-slate-800 cursor-pointer"
        >
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleShortlist(product.id);
            }}
            aria-label="Save to shortlist"
            className={`absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-colors cursor-pointer ${
              isShortlisted
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Heart className={`w-4 h-4 ${isShortlisted ? "fill-rose-600 dark:fill-rose-400" : ""}`} />
          </button>
        </div>

        {/* Clean Unboxed Metadata & Product Details */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate mb-1">
            <span className="uppercase tracking-wider font-medium text-slate-600 dark:text-slate-300">
              {product.brand ?? "Marketplace"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{product.category ?? "Electronics"}</span>
          </div>

          <h3
            onClick={() => onSelect(product)}
            className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-2 min-h-[2.5rem] leading-snug cursor-pointer"
          >
            {product.productName}
          </h3>

          {/* Rating & Review Count */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 mt-2 tabular-nums">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
              {product.rating?.toFixed(1) ?? "N/A"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{(product.reviewCount ?? 0).toLocaleString("en-IN")} ratings</span>
          </div>

          {/* Pricing Baseline */}
          <div className="flex items-baseline gap-2 mt-2.5 tabular-nums">
            <span className="text-base font-bold text-slate-900 dark:text-white">
              {product.price !== null ? `₹${product.price.toLocaleString("en-IN")}` : "Check Price"}
            </span>
            {product.mrp && product.price && product.mrp > product.price && (
              <>
                <span className="text-xs text-slate-400 dark:text-slate-500 line-through">
                  ₹{product.mrp.toLocaleString("en-IN")}
                </span>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {product.discountPercent}% off
                </span>
              </>
            )}
          </div>

          {/* Quiet 1-line ReviewLens Trust Summary */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 font-medium tabular-nums truncate ${
                isFlagged
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {isFlagged ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {Math.round(avgRisk * 100)}% suspicion watch
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  {genuineScore}% genuine pattern
                </>
              )}
            </span>
            {topPro && (
              <span className="text-slate-500 dark:text-slate-400 truncate">Pro: {topPro}</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onToggleCompare(product.id)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isCompared ? (
            <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          ) : (
            <Square className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          )}
          <span>Compare</span>
        </button>

        <div className="flex items-center gap-3 tabular-nums">
          {product.sourceUrl && (
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${storeLabel} product page`}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {storeLabel} <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onSelect(product)}
            className="text-xs font-semibold text-slate-900 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reviews ({auditedCount}) →
          </button>
        </div>
      </div>
    </motion.article>
  );
};
