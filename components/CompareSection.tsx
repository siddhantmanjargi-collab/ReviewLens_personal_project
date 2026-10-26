"use client";

import React from "react";
import { X, Star, ShieldCheck, AlertTriangle, ExternalLink, Scale, Download } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import type { ProductSnapshotSummary } from "./ProductCard";
import { ProductArtwork } from "./ProductArtwork";

interface CompareSectionProps {
  items: { product: ProductRecord; snapshot: ProductSnapshotSummary | null }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelectProduct: (p: ProductRecord) => void;
  onBrowseCatalog: () => void;
}

export const CompareSection: React.FC<CompareSectionProps> = ({
  items,
  onRemove,
  onClear,
  onSelectProduct,
  onBrowseCatalog,
}) => {
  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto my-8">
        <Scale className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-3 stroke-[1.5]" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          No Products Selected to Compare
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
          Tick the Compare box on up to 4 products in the catalog to inspect side-by-side pricing, genuine-adjusted star ratings, hardware specifications, and ReviewLens authenticity metrics.
        </p>
        <button
          type="button"
          onClick={onBrowseCatalog}
          className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
        >
          Browse 30-Item Catalog
        </button>
      </div>
    );
  }

  const allSpecKeys = Array.from(
    new Set(items.flatMap(({ product }) => Object.keys(product.specs ?? {}))),
  );

  const handleExportCsv = () => {
    const headers = [
      "ASIN",
      "Brand",
      "Product Name",
      "Category",
      "Price INR",
      "MRP INR",
      "Marketplace Rating",
      "Genuine-Adjusted Rating",
      "Authenticity Risk %",
      "Amazon URL",
    ];
    const rows = items.map(({ product, snapshot }) => {
      const risk = snapshot?.details?.averageRisk ?? 0.14;
      const genAvg = snapshot?.details?.genuineAverageRating ?? product.rating ?? "";
      return [
        product.externalId,
        product.brand ?? "",
        `"${product.productName.replace(/"/g, '""')}"`,
        product.category ?? "",
        product.price ?? "",
        product.mrp ?? "",
        product.rating ?? "",
        genAvg,
        Math.round(risk * 100),
        product.sourceUrl ?? "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reviewlens-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Side-by-Side Product & Review Intelligence Comparison ({items.length}/4)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Compare Indian market pricing, raw vs genuine-adjusted star ratings, hardware specs, and verified buyer sentiment.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 transition-colors whitespace-nowrap cursor-pointer"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="w-48 p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 align-top bg-slate-50/70 dark:bg-slate-950/60">
                Attribute
              </th>
              {items.map(({ product }) => (
                <th
                  key={product.id}
                  className="p-4 align-top border-l border-slate-200 dark:border-slate-800 min-w-[220px]"
                >
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      onClick={() => onRemove(product.id)}
                      className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                  <div
                    onClick={() => onSelectProduct(product)}
                    className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 bg-white mb-3 cursor-pointer"
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
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    {product.brand} · <span className="font-mono">{product.externalId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    className="text-sm font-semibold text-slate-900 dark:text-white hover:text-amber-700 dark:hover:text-amber-400 text-left line-clamp-2 cursor-pointer"
                  >
                    {product.productName}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-slate-200 dark:divide-slate-800">
            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                Selling Price (INR)
              </td>
              {items.map(({ product }) => (
                <td
                  key={product.id}
                  className="p-4 border-l border-slate-200 dark:border-slate-800 tabular-nums"
                >
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {product.price !== null ? `₹${product.price.toLocaleString("en-IN")}` : "N/A"}
                  </span>
                  {product.mrp && product.price && product.mrp > product.price && (
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      MRP <span className="line-through">₹{product.mrp.toLocaleString("en-IN")}</span> ·{" "}
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {product.discountPercent}% off
                      </span>
                    </div>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                Marketplace Rating
              </td>
              {items.map(({ product }) => (
                <td
                  key={product.id}
                  className="p-4 border-l border-slate-200 dark:border-slate-800 tabular-nums"
                >
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                    {product.rating?.toFixed(1) ?? "N/A"} / 5.0
                  </span>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                    {(product.reviewCount ?? 0).toLocaleString("en-IN")} customer ratings
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                Genuine-Adjusted Score
              </td>
              {items.map(({ product, snapshot }) => {
                const rawAvg = snapshot?.details?.rawAverageRating ?? product.rating ?? 0;
                const genAvg = snapshot?.details?.genuineAverageRating ?? rawAvg;
                const delta = Math.round((genAvg - rawAvg) * 100) / 100;
                return (
                  <td
                    key={product.id}
                    className="p-4 border-l border-slate-200 dark:border-slate-800 tabular-nums"
                  >
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {genAvg.toFixed(2)}★
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                      vs {rawAvg.toFixed(2)}★ raw
                    </span>
                    <div
                      className={`mt-0.5 font-medium ${
                        delta < 0
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {delta === 0
                        ? "Aligned with raw sample"
                        : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}★ after spam/mismatch filter`}
                    </div>
                  </td>
                );
              })}
            </tr>

            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                ReviewLens Authenticity
              </td>
              {items.map(({ product, snapshot }) => {
                const risk = snapshot?.details?.averageRisk ?? 0.14;
                const genuine = Math.round((1 - risk) * 100);
                return (
                  <td
                    key={product.id}
                    className="p-4 border-l border-slate-200 dark:border-slate-800 tabular-nums"
                  >
                    <div className="inline-flex items-center gap-1.5 font-semibold">
                      {risk >= 0.25 ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-amber-700 dark:text-amber-400">
                            {Math.round(risk * 100)}% Suspicion Risk
                          </span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {genuine}% Genuine Pattern
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Based on {snapshot?.reviewsAnalyzed ?? 6} audited reviews
                    </div>
                  </td>
                );
              })}
            </tr>

            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                Sentiment Split
              </td>
              {items.map(({ product, snapshot }) => (
                <td
                  key={product.id}
                  className="p-4 border-l border-slate-200 dark:border-slate-800 tabular-nums text-slate-700 dark:text-slate-200"
                >
                  {snapshot?.sentimentPercentages ? (
                    <div className="space-y-1">
                      <div>
                        Positive:{" "}
                        <strong className="text-emerald-700 dark:text-emerald-400">
                          {snapshot.sentimentPercentages.positive}%
                        </strong>
                      </div>
                      <div>
                        Neutral: <strong>{snapshot.sentimentPercentages.neutral}%</strong>
                      </div>
                      <div>
                        Negative:{" "}
                        <strong className="text-rose-700 dark:text-rose-400">
                          {snapshot.sentimentPercentages.negative}%
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">Pending snapshot</span>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                Top Buyer Aspects
              </td>
              {items.map(({ product, snapshot }) => (
                <td key={product.id} className="p-4 border-l border-slate-200 dark:border-slate-800">
                  {snapshot?.aspects && snapshot.aspects.length > 0 ? (
                    <ul className="space-y-1 text-slate-700 dark:text-slate-200">
                      {snapshot.aspects.slice(0, 3).map((a) => (
                        <li key={a.aspectName} className="tabular-nums">
                          <span className="capitalize font-medium">{a.aspectName}</span> ·{" "}
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {a.positivePercent}% pos
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                  )}
                </td>
              ))}
            </tr>

            {allSpecKeys.map((key) => (
              <tr key={key}>
                <td className="p-4 font-medium text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                  {key}
                </td>
                {items.map(({ product }) => (
                  <td
                    key={product.id}
                    className="p-4 border-l border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100"
                  >
                    {product.specs?.[key] !== undefined ? String(product.specs[key]) : "—"}
                  </td>
                ))}
              </tr>
            ))}

            <tr>
              <td className="p-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/60">
                Credible Links
              </td>
              {items.map(({ product }) => (
                <td
                  key={product.id}
                  className="p-4 border-l border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  {product.sourceUrl && (
                    <div>
                      <a
                        href={product.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                      >
                        Amazon.in Product Page <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  <div>
                    <a
                      href={`https://www.flipkart.com/search?q=${encodeURIComponent(
                        `${product.brand ?? ""} ${product.model ?? product.productName}`.trim(),
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    >
                      Check Flipkart <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  {product.officialUrl && (
                    <div>
                      <a
                        href={product.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      >
                        Official {product.brand ?? "Brand"} Site <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
