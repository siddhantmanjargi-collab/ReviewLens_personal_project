"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Star,
  Plus,
  Trash2,
  Upload,
  Download,
} from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import type { ProductSnapshotSummary } from "./ProductCard";

interface ReviewTesterProps {
  catalogItems?: { product: ProductRecord; snapshot: ProductSnapshotSummary | null }[];
}

const SINGLE_PRESETS = [
  {
    label: "Genuine Owner Detail",
    rating: 4,
    title: "Solid 6.5h screen-on time on Jio 5G, 60Hz panel feels dated",
    text: "Switched from iPhone 12. Default 24MP photos preserve natural skin tones in indoor warm lighting, and USB-C works with my MacBook cable. Only gripe at ₹69,900 is the 60Hz refresh rate.",
  },
  {
    label: "Incentivized Cashback Spam",
    rating: 5,
    title: "BEST PRODUCT EVER RS 100 CASHBACK CARD MUST BUY!!!!",
    text: "AWESOME SUPERB QUALITY BEST EVER IN INDIA GIVE 5 STARS SCREENSHOT ON WHATSAPP FOR WARRANTY BONUS JUST BUY DONT MISS FIVE STARS!!!",
  },
  {
    label: "5-Star Complaint Mismatch",
    rating: 5,
    title: "Selected 5 stars by mistake — right earbud stopped charging",
    text: "Tapped 5 stars accidentally on mobile app. Right earbud stopped charging after 11 days and glossy case scratched inside my pocket on day two. Very disappointed.",
  },
  {
    label: "1-Star Accidental Praise",
    rating: 1,
    title: "Clicked 1 star accidentally — best OLED laptop under ₹60k!",
    text: "Oops hit 1 star! The 600-nit 100% DCI-P3 OLED panel is cinema-grade for Lightroom editing and the H-series i5 compiles code twice as fast as my old laptop.",
  },
];

interface DraftBatchReview {
  title: string;
  text: string;
  rating: number;
  verifiedPurchase: boolean;
  reviewerName: string;
}

const DEFAULT_BATCH_PRESET: DraftBatchReview[] = [
  {
    reviewerName: "Karthik S.",
    rating: 5,
    verifiedPurchase: true,
    title: "Blocks metro cabin hum by ~85% and multipoint never drops",
    text: "Worn 3 hours daily on Bengaluru Metro with eyeglasses—250g pads stay comfortable and switching from MacBook Zoom calls to phone LDAC audio is instant.",
  },
  {
    reviewerName: "Rohit B.",
    rating: 4,
    verifiedPurchase: true,
    title: "Great 8-mic call clarity, but non-folding case is bulky",
    text: "Call pickup on noisy streets beats my old XM4 easily, and 3-min USB-PD charge gives 3 hours. Just wish the hinges folded inward instead of taking half my backpack.",
  },
  {
    reviewerName: "DealKing_99",
    rating: 5,
    verifiedPurchase: false,
    title: "SUPERB HEADPHONE BEST EVER MUST BUY FIVE STARS!!!!",
    text: "AWESOME SOUND BEST PRODUCT IN MARKET 100% GENUINE VALUE FOR MONEY JUST BUY DONT MISS FIVE STARS!!!",
  },
  {
    reviewerName: "PromoBot_42",
    rating: 5,
    verifiedPurchase: false,
    title: "AWESOME SOUND BEST PRODUCT IN MARKET MUST BUY!!!!",
    text: "AWESOME SOUND BEST PRODUCT IN MARKET 100% GENUINE VALUE FOR MONEY JUST BUY DONT MISS SUPERB FIVE STARS!!!",
  },
  {
    reviewerName: "Shreya K.",
    rating: 5,
    verifiedPurchase: true,
    title: "Tapped 5 stars by mistake — earcups get sweaty without AC",
    text: "Meant to leave 2 stars. Synthetic leather pads trap heat within 30 minutes in humid summer weather and Auto ANC shifts pressure randomly.",
  },
  {
    reviewerName: "Akash M.",
    rating: 2,
    verifiedPurchase: true,
    title: "Muddy 200Hz upper-bass out of the box until tweaked in app",
    text: "Default tuning bloats male vocals until you install Sony Sound Connect and drop Clear Bass to -2, plus zero IPX sweat resistance for ₹26,990.",
  },
];

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

export const ReviewTesterSection: React.FC<ReviewTesterProps> = ({ catalogItems = [] }) => {
  const [labMode, setLabMode] = useState<"single" | "batch">("batch");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Single Review Inspector State
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [reviewText, setReviewText] = useState(SINGLE_PRESETS[0]!.text);
  const [title, setTitle] = useState(SINGLE_PRESETS[0]!.title);
  const [rating, setRating] = useState(SINGLE_PRESETS[0]!.rating);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleResult, setSingleResult] = useState<any>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Batch Segregator State
  const [batchProductName, setBatchProductName] = useState(
    "Sony WH-1000XM5 Wireless ANC Headphones",
  );
  const [batchReviews, setBatchReviews] = useState<DraftBatchReview[]>(DEFAULT_BATCH_PRESET);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchLoadingProduct, setBatchLoadingProduct] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [activeBucketFilter, setActiveBucketFilter] = useState<
    "all" | "genuine" | "rating_mismatch" | "moderate_suspicion" | "highly_suspicious"
  >("all");

  const handleSingleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    setSingleLoading(true);
    setSingleError(null);

    try {
      const res = await fetch("/api/test-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewText,
          title,
          rating,
          productId: selectedProductId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to evaluate review");
      setSingleResult(data);
    } catch (err: any) {
      setSingleError(err.message || "Error running review detector");
    } finally {
      setSingleLoading(false);
    }
  };

  const handleLoadCatalogProductReviews = async (prodId: string) => {
    if (!prodId) return;
    const found = catalogItems.find((c) => c.product.id === prodId)?.product;
    if (!found) return;

    setBatchLoadingProduct(true);
    setBatchError(null);
    setUploadNotice(null);
    setBatchResult(null);

    try {
      const res = await fetch(`/api/reviews?productId=${prodId}&limit=30`);
      const data = await res.json();
      const list = Array.isArray(data.reviews) ? data.reviews : [];
      if (list.length > 0) {
        setBatchProductName(found.productName);
        setBatchReviews(
          list.map((r: any) => ({
            reviewerName: r.reviewerName || "Buyer",
            rating: r.rating || 5,
            verifiedPurchase: Boolean(r.verifiedPurchase),
            title: r.reviewTitle || "",
            text: r.reviewText || "",
          })),
        );
      }
    } catch {
      setBatchError("Could not load catalog reviews.");
    } finally {
      setBatchLoadingProduct(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchError(null);
    setUploadNotice(null);
    setBatchResult(null);

    try {
      const raw = await file.text();
      let parsedRows: DraftBatchReview[] = [];

      if (file.name.toLowerCase().endsWith(".json")) {
        const json = JSON.parse(raw);
        const arr = Array.isArray(json) ? json : Array.isArray(json.reviews) ? json.reviews : [];
        parsedRows = arr
          .slice(0, 60)
          .map((r: any, idx: number) => ({
            reviewerName: String(r.reviewerName ?? r.reviewer ?? `Shopper ${idx + 1}`),
            rating: Math.min(5, Math.max(1, Math.round(Number(r.rating ?? 5)))),
            verifiedPurchase: Boolean(r.verifiedPurchase ?? r.verified ?? true),
            title: String(r.title ?? r.reviewTitle ?? ""),
            text: String(r.text ?? r.reviewText ?? ""),
          }))
          .filter((r: DraftBatchReview) => r.text.trim().length >= 4);
      } else {
        const lines = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length < 2) throw new Error("CSV must include a header row and at least 1 review.");
        const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
        const idxReviewer = headers.findIndex((h) => h.includes("reviewer") || h.includes("author") || h === "name");
        const idxRating = headers.findIndex((h) => h.includes("rating") || h.includes("star"));
        const idxVerified = headers.findIndex((h) => h.includes("verified"));
        const idxTitle = headers.findIndex((h) => h.includes("title") || h.includes("headline"));
        const idxText = headers.findIndex((h) => h.includes("text") || h.includes("body") || h.includes("review"));

        for (let i = 1; i < Math.min(lines.length, 61); i++) {
          const cols = parseCsvLine(lines[i]!);
          const textVal = idxText >= 0 ? cols[idxText] ?? "" : cols[cols.length - 1] ?? "";
          if (textVal.length < 4) continue;
          const verRaw = idxVerified >= 0 ? (cols[idxVerified] ?? "true").toLowerCase() : "true";
          parsedRows.push({
            reviewerName: (idxReviewer >= 0 ? cols[idxReviewer] : "") || `CSV Buyer ${i}`,
            rating: Math.min(5, Math.max(1, Math.round(Number(idxRating >= 0 ? cols[idxRating] : 5) || 5))),
            verifiedPurchase: verRaw === "true" || verRaw === "1" || verRaw === "yes",
            title: idxTitle >= 0 ? cols[idxTitle] ?? "" : "",
            text: textVal,
          });
        }
      }

      if (parsedRows.length === 0) {
        throw new Error("No valid reviews found in uploaded file.");
      }
      setBatchReviews(parsedRows);
      setBatchProductName(file.name.replace(/\.(csv|json)$/i, ""));
      setUploadNotice(`Loaded ${parsedRows.length} reviews from ${file.name} (ready to segregate).`);
    } catch (err: any) {
      setBatchError(err.message || "Failed to parse CSV/JSON file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadSampleCsv = () => {
    const header = "reviewer,rating,verified,title,text";
    const rows = DEFAULT_BATCH_PRESET.map(
      (r) =>
        `"${r.reviewerName.replace(/"/g, '""')}",${r.rating},${r.verifiedPurchase},"${r.title.replace(/"/g, '""')}","${r.text.replace(/"/g, '""')}"`,
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reviewlens-sample-batch.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBatchReport = (format: "json" | "csv") => {
    if (!batchResult) return;
    if (format === "json") {
      const blob = new Blob([JSON.stringify(batchResult, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "reviewlens-segregation-audit.json";
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = [
      "Reviewer",
      "Star Rating",
      "Verified",
      "Segregation Bucket",
      "Suspicion Risk %",
      "Prose Sentiment",
      "Star Mismatch %",
      "Title",
      "Signals",
    ];
    const rows = (batchResult.items ?? []).map((item: any) =>
      [
        `"${String(item.reviewerName ?? "").replace(/"/g, '""')}"`,
        item.rating,
        item.verifiedPurchase,
        item.segregationBucket,
        Math.round((item.authenticityRisk ?? 0) * 100),
        item.sentiment,
        Math.round((item.ratingMismatch ?? 0) * 100),
        `"${String(item.title ?? "").replace(/"/g, '""')}"`,
        `"${String((item.reasoningSignals ?? []).join("; ")).replace(/"/g, '""')}"`,
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reviewlens-segregation-audit.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRunBatchSegregation = async () => {
    if (batchReviews.length === 0) return;
    setBatchLoading(true);
    setBatchError(null);
    setActiveBucketFilter("all");

    try {
      const res = await fetch("/api/segregate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: batchProductName,
          reviews: batchReviews,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch segregation failed");
      setBatchResult(data);
    } catch (err: any) {
      setBatchError(err.message || "Error segregating review batch");
    } finally {
      setBatchLoading(false);
    }
  };

  const filteredBatchItems = useMemo(() => {
    if (!batchResult?.items) return [];
    if (activeBucketFilter === "all") return batchResult.items;
    return batchResult.items.filter((i: any) => i.segregationBucket === activeBucketFilter);
  }, [batchResult, activeBucketFilter]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Mode Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
            Review Segregation & Authenticity Lab
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            Upload a CSV/JSON dataset or load real catalog reviews to run live Gemini + 6-signal heuristic segregation with SHA-256 content-hash deduplication and audit export.
          </p>
        </div>

        <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setLabMode("batch")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              labMode === "batch"
                ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-amber-400 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Batch & CSV Segregator
          </button>
          <button
            type="button"
            onClick={() => setLabMode("single")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              labMode === "single"
                ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-amber-400 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Single Review Forensics
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODE 1: MULTI-REVIEW BATCH & CSV/JSON SEGREGATOR
         ===================================================================== */}
      {labMode === "batch" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Load Real Reviews from Any of the 30 Catalog Products:
                </label>
                <select
                  defaultValue=""
                  disabled={batchLoadingProduct}
                  onChange={(e) => handleLoadCatalogProductReviews(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400 cursor-pointer"
                >
                  <option value="">
                    Select a catalog item to load its real buyer reviews...
                  </option>
                  {catalogItems.map(({ product }) => (
                    <option key={product.id} value={product.id}>
                      [{product.category}] {product.brand} — {product.productName.slice(0, 62)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-400 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload CSV / JSON
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Sample CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBatchProductName("Sony WH-1000XM5 Wireless ANC Headphones");
                    setBatchReviews(DEFAULT_BATCH_PRESET);
                    setBatchResult(null);
                    setUploadNotice(null);
                  }}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Reset Preset
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setBatchReviews((prev) =>
                      prev.length >= 60
                        ? prev
                        : [
                            ...prev,
                            {
                              reviewerName: `Shopper ${prev.length + 1}`,
                              rating: 5,
                              verifiedPurchase: true,
                              title: "",
                              text: "",
                            },
                          ],
                    )
                  }
                  className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-400 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </div>

            {uploadNotice && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {uploadNotice}
              </p>
            )}

            {/* Editable Batch Input List */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {batchReviews.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={item.reviewerName}
                        onChange={(e) =>
                          setBatchReviews((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, reviewerName: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="Reviewer"
                        className="w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                      />
                      <select
                        value={item.rating}
                        onChange={(e) =>
                          setBatchReviews((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, rating: Number(e.target.value) } : r,
                            ),
                          )
                        }
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>
                            {s} ★
                          </option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.verifiedPurchase}
                          onChange={(e) =>
                            setBatchReviews((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, verifiedPurchase: e.target.checked } : r,
                              ),
                            )
                          }
                          className="rounded"
                        />
                        Verified Purchase
                      </label>
                    </div>

                    {batchReviews.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setBatchReviews((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Remove review row"
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        setBatchReviews((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)),
                        )
                      }
                      placeholder="Headline..."
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) =>
                        setBatchReviews((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, text: e.target.value } : r)),
                        )
                      }
                      placeholder="Review prose..."
                      className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>

            {batchError && (
              <p className="text-xs text-rose-700 dark:text-rose-400">{batchError}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Target Product:{" "}
                <strong className="text-slate-800 dark:text-slate-200">{batchProductName}</strong> (
                {batchReviews.length} reviews in batch, max 60)
              </span>
              <button
                type="button"
                disabled={batchLoading}
                onClick={handleRunBatchSegregation}
                className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {batchLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {batchLoading
                  ? "Running Live Gemini + Heuristic Segregation..."
                  : `Segregate All ${batchReviews.length} Reviews Live`}
              </button>
            </div>
          </div>

          {/* Segregated Batch Results */}
          {batchResult && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 tabular-nums">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Live Segregation Audit Report
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Engine:{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {batchResult.aiPowered
                        ? `${batchResult.model} + 6-Signal Heuristics`
                        : "6-Signal Deterministic Heuristics"}
                    </span>
                    {batchResult.cacheTelemetry && (
                      <span>
                        {" "}
                        · SHA-256 Cache: {batchResult.cacheTelemetry.batchHits} hits /{" "}
                        {batchResult.cacheTelemetry.batchMisses} misses
                      </span>
                    )}
                  </p>
                  {!batchResult.aiPowered &&
                    (batchResult.fallbackReason === "missing_api_key" ||
                      batchResult.fallbackReason === "invalid_api_key") && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Scored locally via 6-signal heuristics · Set a valid{" "}
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          GEMINI_API_KEY
                        </span>{" "}
                        in <strong className="font-semibold text-slate-700 dark:text-slate-200">Settings &gt; Secrets</strong>{" "}
                        for live Gemini prose scoring.
                      </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-5 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Raw Average</span>
                    <strong className="text-lg text-slate-800 dark:text-slate-200">
                      {batchResult.rawAverageRating?.toFixed(2)}★
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">
                      Genuine-Adjusted
                    </span>
                    <strong className="text-lg text-emerald-700 dark:text-emerald-400">
                      {batchResult.genuineAverageRating !== null
                        ? `${batchResult.genuineAverageRating.toFixed(2)}★`
                        : "N/A"}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleExportBatchReport("csv")}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportBatchReport("json")}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> JSON
                    </button>
                  </div>
                </div>
              </div>

              {/* Clickable Segregation Bucket Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums text-xs">
                {(
                  [
                    {
                      id: "all",
                      label: "All Analyzed",
                      count: batchResult.totalReviews,
                      tone: "text-slate-900 dark:text-white",
                    },
                    {
                      id: "genuine",
                      label: "Genuine Keepers",
                      count: batchResult.counts.genuine,
                      tone: "text-emerald-700 dark:text-emerald-400",
                    },
                    {
                      id: "rating_mismatch",
                      label: "Star-Text Mismatch",
                      count: batchResult.counts.ratingMismatch,
                      tone: "text-amber-700 dark:text-amber-400",
                    },
                    {
                      id: "moderate_suspicion",
                      label: "Moderate Suspicion",
                      count: batchResult.counts.moderateSuspicion,
                      tone: "text-amber-700 dark:text-amber-400",
                    },
                    {
                      id: "highly_suspicious",
                      label: "High Suspicion Spam",
                      count: batchResult.counts.highlySuspicious,
                      tone: "text-rose-700 dark:text-rose-400",
                    },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveBucketFilter(b.id)}
                    className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      activeBucketFilter === b.id
                        ? "border-slate-900 dark:border-amber-400 bg-slate-50 dark:bg-slate-800/80"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-400"
                    }`}
                  >
                    <span className="text-slate-500 dark:text-slate-400 block mb-1">{b.label}</span>
                    <strong className={`text-xl font-bold ${b.tone}`}>{b.count}</strong>
                  </button>
                ))}
              </div>

              {/* 3-Gram Duplicate Cluster Alert inside Batch */}
              {batchResult.duplicatePairs?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                  <strong className="text-amber-800 dark:text-amber-400 mr-2">
                    3-Gram Shingle Clone Alert:
                  </strong>
                  {batchResult.duplicatePairs
                    .map(
                      (p: any) =>
                        `${p.reviewerA} ↔ ${p.reviewerB} (${Math.round(p.similarity * 100)}% overlap)`,
                    )
                    .join(" · ")}
                </div>
              )}

              {/* Trusted Aspects Extracted from Genuine Keepers */}
              {batchResult.trustedAspects?.length > 0 && (
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 mr-2">
                    Trusted Aspects (from Genuine Keepers only):
                  </span>
                  {batchResult.trustedAspects.map((a: any, idx: number) => (
                    <span key={a.name}>
                      {idx > 0 && " · "}
                      <span className="capitalize font-medium text-slate-900 dark:text-white">
                        {a.name}
                      </span>{" "}
                      ({a.positive} pos / {a.negative} neg)
                    </span>
                  ))}
                </div>
              )}

              {/* Segregated Items List */}
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {filteredBatchItems.map((item: any) => (
                  <div key={item.id} className="p-4 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5 text-amber-500 dark:text-amber-400">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < item.rating
                                  ? "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
                                  : "text-slate-200 dark:text-slate-700"
                              }`}
                            />
                          ))}
                        </span>
                        <strong className="text-sm text-slate-900 dark:text-white">
                          {item.title || "Review"}
                        </strong>
                        <span className="text-slate-400">· {item.reviewerName}</span>
                      </div>

                      <span
                        className={`font-semibold ${
                          item.segregationBucket === "genuine"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : item.segregationBucket === "rating_mismatch"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        Bucket: {item.segregationBucket.replace(/_/g, " ")} ·{" "}
                        {Math.round(item.authenticityRisk * 100)}% risk · Prose: {item.sentiment}
                      </span>
                    </div>

                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      {item.text}
                    </p>

                    <div className="text-slate-500 dark:text-slate-400 pt-0.5">
                      Signals:{" "}
                      <span className="text-slate-700 dark:text-slate-300">
                        {item.reasoningSignals?.join(" · ") || "Clean personal usage pattern"}
                      </span>
                      {item.aspects?.length > 0 && (
                        <span>
                          {" "}
                          · Aspects:{" "}
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {item.aspects.map((a: any) => `${a.name} (${a.sentiment})`).join(", ")}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODE 2: SINGLE REVIEW FORENSICS (WITH REAL PRODUCT SIBLING CONTEXT)
         ===================================================================== */}
      {labMode === "single" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
              Load sample review:
            </span>
            {SINGLE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setTitle(p.title);
                  setReviewText(p.text);
                  setRating(p.rating);
                  setSingleResult(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleSingleTest}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Compare Against Real Catalog Product (Optional Near-Duplicate Context)
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                >
                  <option value="">Standalone Mode (No sibling reviews)</option>
                  {catalogItems.map(({ product }) => (
                    <option key={product.id} value={product.id}>
                      {product.brand} — {product.productName.slice(0, 56)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Review Title
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Star Rating:</span>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>
                        {r} ★
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Review headline..."
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Review Text
                </label>
                <textarea
                  rows={6}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Paste any e-commerce product review here..."
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 leading-relaxed focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                />
              </div>

              {singleError && (
                <p className="text-xs text-rose-700 dark:text-rose-400">{singleError}</p>
              )}

              <button
                type="submit"
                disabled={singleLoading || !reviewText.trim()}
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {singleLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {singleLoading ? "Evaluating Signals..." : "Evaluate Review"}
              </button>
            </form>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4 text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Signal Breakdown
                  </span>
                  {singleResult && (
                    <span className="text-slate-500 dark:text-slate-400 font-mono">
                      {singleResult.aiPowered
                        ? `${singleResult.model} + Heuristics`
                        : "Heuristic Signals"}
                    </span>
                  )}
                </div>

                {singleLoading ? (
                  <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-600 dark:text-slate-300 mx-auto mb-2" />
                    Analyzing text structure, aspects, and star alignment...
                  </div>
                ) : singleResult ? (
                  <div className="space-y-4 text-xs">
                    {!singleResult.aiPowered &&
                      (singleResult.fallbackReason === "missing_api_key" ||
                        singleResult.fallbackReason === "invalid_api_key") && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Scored locally via 6-signal heuristics · Set a valid{" "}
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            GEMINI_API_KEY
                          </span>{" "}
                          in <strong className="font-semibold text-slate-700 dark:text-slate-200">Settings &gt; Secrets</strong>{" "}
                          for live Gemini model inference.
                        </p>
                      )}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between tabular-nums">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
                          Classification
                        </span>
                        <span
                          className={`text-base font-bold capitalize inline-flex items-center gap-1.5 ${
                            singleResult.authenticityRisk >= 0.33
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {singleResult.authenticityRisk >= 0.33 ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                          {singleResult.classification?.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white">
                          {Math.round(singleResult.authenticityRisk * 100)}%
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Suspicion Risk
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 tabular-nums">
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Prose Sentiment
                        </span>
                        <strong className="text-slate-900 dark:text-white capitalize">
                          {singleResult.sentiment} (
                          {Math.round((singleResult.sentimentConfidence ?? 0.85) * 100)}%)
                        </strong>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400 block">
                          {singleResult.aiPowered ? "Gemini AI Risk" : "Lexical Risk"}
                        </span>
                        <strong className="text-slate-900 dark:text-white">
                          {Math.round((singleResult.riskBreakdown?.geminiRisk ?? 0) * 100)}%
                        </strong>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Star Mismatch
                        </span>
                        <strong
                          className={
                            (singleResult.riskBreakdown?.ratingMismatch ?? 0) >= 0.3
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-slate-900 dark:text-white"
                          }
                        >
                          {Math.round((singleResult.riskBreakdown?.ratingMismatch ?? 0) * 100)}%
                        </strong>
                      </div>
                    </div>

                    {singleResult.aspects?.length > 0 && (
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                          Extracted Product Aspects:
                        </span>
                        <p className="text-slate-600 dark:text-slate-300">
                          {singleResult.aspects
                            .map(
                              (a: any) =>
                                `${a.name} (${a.sentiment}, ${Math.round(a.confidence * 100)}%)`,
                            )
                            .join(" · ")}
                        </p>
                      </div>
                    )}

                    {singleResult.reasoningSignals?.length > 0 && (
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                          {singleResult.aiPowered
                            ? "Gemini Reasoning Signals:"
                            : "Detected Forensic Signals:"}
                        </span>
                        <p className="text-slate-600 dark:text-slate-300">
                          {singleResult.reasoningSignals.join(" · ")}
                        </p>
                      </div>
                    )}

                    {singleResult.heuristicSignals && (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                        {singleResult.heuristicSignals
                          .filter((s: any) => s.applicable)
                          .map((sig: any) => (
                            <div
                              key={sig.name}
                              className="px-3 py-2 flex items-center justify-between gap-3 tabular-nums"
                            >
                              <div>
                                <span className="font-medium text-slate-800 dark:text-slate-100 capitalize">
                                  {sig.name.replace(/_/g, " ")}
                                </span>
                                <p className="text-slate-500 dark:text-slate-400">{sig.detail}</p>
                              </div>
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                                {Math.round(sig.strength * 100)}%
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
                    Submit a review on the left to inspect its hybrid authenticity risk, star-prose alignment, and extracted aspects.
                  </div>
                )}
              </div>

              {singleResult && (
                <button
                  type="button"
                  onClick={() => setSingleResult(null)}
                  className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 self-end cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear Result
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
