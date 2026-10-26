"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  BookmarkPlus,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  ExternalLink,
  Globe,
  Heart,
  Link2,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { CatalogAlternativeItem, LinkAnalysisReport } from "@/lib/linkAnalyzer";
import type { ProductRecord } from "@/lib/types";
import { ProductArtwork } from "./ProductArtwork";

const RECENT_ANALYSES_STORAGE_KEY = "rl_recent_link_analyses";

interface SampleLinkOption {
  label: string;
  store: string;
  url: string;
}

const SAMPLE_LINKS: SampleLinkOption[] = [
  {
    label: "Apple iPhone 15 (128 GB)",
    store: "Amazon.in",
    url: "https://www.amazon.in/dp/B0CHX1W1XY",
  },
  {
    label: "Samsung Galaxy S24 Ultra 5G",
    store: "Amazon.in",
    url: "https://www.amazon.in/dp/B0CS5XW6TN",
  },
  {
    label: "Sony WH-1000XM5 Wireless ANC",
    store: "Flipkart",
    url: "https://www.flipkart.com/sony-wh-1000xm5-bluetooth-headset/p/itm9ef52b6cd8b2a?pid=ACCG9G2VVZBDG6K8",
  },
  {
    label: "Generic Ultra Smartwatch (Unverified Store)",
    store: "Web Listing",
    url: "https://flashgadgetdeals-india.example.com/products/ultra-max-pro-smartwatch-90-off",
  },
];

const INSPECTION_STEPS = [
  "Opening product webpage and reading structured Schema.org & OpenGraph metadata",
  "Cross-checking specifications, INR street pricing, and independent buyer reviews",
  "Computing product reliability verdict and higher-trust catalog alternatives",
];

interface LinkAnalyzerSectionProps {
  sessionToken: string | null;
  shortlistIds: string[];
  compareIds: string[];
  focusTrigger: number;
  onToggleShortlist: (productId: string) => void;
  onToggleCompare: (productId: string) => void;
  onSelectProductById: (productId: string) => void;
  onProductSavedToCatalog: (product: ProductRecord) => Promise<void> | void;
}

export const LinkAnalyzerSection: React.FC<LinkAnalyzerSectionProps> = ({
  sessionToken,
  shortlistIds,
  compareIds,
  focusTrigger,
  onToggleShortlist,
  onToggleCompare,
  onSelectProductById,
  onProductSavedToCatalog,
}) => {
  const [urlInput, setUrlInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<LinkAnalysisReport | null>(null);
  const [recentReports, setRecentReports] = useState<LinkAnalysisReport[]>([]);
  const [savingToCatalog, setSavingToCatalog] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RECENT_ANALYSES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentReports(parsed.slice(0, 6));
          setActiveReport(parsed[0]);
          setUrlInput(parsed[0].submittedUrl ?? "");
        }
      }
    } catch {
      // Ignore restricted storage environments
    }
  }, []);

  useEffect(() => {
    if (focusTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [focusTrigger]);

  useEffect(() => {
    if (!analyzing) {
      setStepIndex(0);
      return;
    }
    const timer1 = window.setTimeout(() => setStepIndex(1), 900);
    const timer2 = window.setTimeout(() => setStepIndex(2), 2100);
    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
    };
  }, [analyzing]);

  const persistRecentReport = useCallback((nextReport: LinkAnalysisReport) => {
    setRecentReports((prev) => {
      const deduped = [
        nextReport,
        ...prev.filter((r) => r.finalUrl !== nextReport.finalUrl && r.submittedUrl !== nextReport.submittedUrl),
      ].slice(0, 6);
      try {
        window.localStorage.setItem(RECENT_ANALYSES_STORAGE_KEY, JSON.stringify(deduped));
      } catch {}
      return deduped;
    });
  }, []);

  const clearRecentHistory = useCallback(() => {
    setRecentReports([]);
    try {
      window.localStorage.removeItem(RECENT_ANALYSES_STORAGE_KEY);
    } catch {}
  }, []);

  const runInspection = useCallback(
    async (targetUrl: string) => {
      const cleaned = targetUrl.trim();
      if (!cleaned) {
        setErrorMsg("Please paste an Amazon.in, Flipkart, or product webpage link first.");
        inputRef.current?.focus();
        return;
      }

      setAnalyzing(true);
      setErrorMsg(null);
      setSaveNotice(null);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }

      try {
        const res = await fetch("/api/analyze-link", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            url: cleaned,
            shortlistIds,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !data?.report) {
          setErrorMsg(data?.error || "Could not analyze that product link. Please verify the URL and try again.");
          return;
        }
        const report = data.report as LinkAnalysisReport;
        setActiveReport(report);
        persistRecentReport(report);
      } catch {
        setErrorMsg("Network error while inspecting the product link. Please try again.");
      } finally {
        setAnalyzing(false);
      }
    },
    [persistRecentReport, sessionToken, shortlistIds],
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runInspection(urlInput);
  };

  const ensureCatalogProductId = useCallback(
    async (report: LinkAnalysisReport): Promise<string | null> => {
      if (report.matchedCatalogProductId) {
        return report.matchedCatalogProductId;
      }

      setSavingToCatalog(true);
      setSaveNotice(null);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }

      try {
        const res = await fetch("/api/save-analyzed-product", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            marketplace: report.marketplace,
            externalId: report.externalId,
            productName: report.productName,
            brand: report.brand,
            model: report.model,
            category: report.category,
            summary: report.summary,
            imageUrl: report.imageUrl,
            price: report.price,
            mrp: report.mrp,
            currency: report.currency,
            rating: report.rating,
            reviewCount: report.reviewCount,
            availability: report.availability,
            specs: report.specs,
            sourceUrl: report.finalUrl || report.submittedUrl,
            reliabilityScore: report.reliabilityScore,
            analysisMode: report.analysisMode,
            pros: report.pros,
            cons: report.cons,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !data?.product) {
          setErrorMsg(data?.error || "Unable to save this product to the catalog.");
          return null;
        }
        const savedProduct = data.product as ProductRecord;
        const updatedReport: LinkAnalysisReport = {
          ...report,
          matchedCatalogProductId: savedProduct.id,
        };
        setActiveReport(updatedReport);
        persistRecentReport(updatedReport);
        await onProductSavedToCatalog(savedProduct);
        setSaveNotice(
          data.status === "existing"
            ? "Linked to existing product in your ReviewLens catalog."
            : "Saved analyzed product to your ReviewLens catalog.",
        );
        return savedProduct.id;
      } catch {
        setErrorMsg("Could not save product to the catalog right now.");
        return null;
      } finally {
        setSavingToCatalog(false);
      }
    },
    [onProductSavedToCatalog, persistRecentReport, sessionToken],
  );

  const handleSaveToCatalogClick = async () => {
    if (!activeReport) return;
    await ensureCatalogProductId(activeReport);
  };

  const handleShortlistAnalyzed = async () => {
    if (!activeReport) return;
    const productId = await ensureCatalogProductId(activeReport);
    if (productId) {
      onToggleShortlist(productId);
    }
  };

  const handleCompareAnalyzed = async () => {
    if (!activeReport) return;
    const productId = await ensureCatalogProductId(activeReport);
    if (productId) {
      onToggleCompare(productId);
    }
  };

  const matchedId = activeReport?.matchedCatalogProductId ?? null;
  const isShortlisted = Boolean(matchedId && shortlistIds.includes(matchedId));
  const isCompared = Boolean(matchedId && compareIds.includes(matchedId));
  const specEntries = Object.entries(activeReport?.specs ?? {});

  const renderVerdictBanner = (report: LinkAnalysisReport) => {
    if (report.verdict === "reliable") {
      return (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/75 dark:bg-emerald-950/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-300">
              <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>Verdict: Reliable Product to Buy</span>
            </div>
            <span className="font-mono text-sm font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
              {report.reliabilityScore}/100 Reliability Score
            </span>
          </div>
          <p className="text-sm text-emerald-950/90 dark:text-emerald-100/90 leading-relaxed">
            {report.reliabilityStatement}
          </p>
        </div>
      );
    }

    if (report.verdict === "caution") {
      return (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-amber-950 dark:text-amber-300">
              <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>Verdict: Buy with Caution — Verify Seller & Caveats</span>
            </div>
            <span className="font-mono text-sm font-bold text-amber-900 dark:text-amber-300 tabular-nums">
              {report.reliabilityScore}/100 Reliability Score
            </span>
          </div>
          <p className="text-sm text-amber-950/90 dark:text-amber-100/90 leading-relaxed">
            {report.reliabilityStatement}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-rose-950 dark:text-rose-300">
            <ShieldAlert className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0" />
            <span>Verdict: High Risk / Unreliable Listing</span>
          </div>
          <span className="font-mono text-sm font-bold text-rose-900 dark:text-rose-300 tabular-nums">
            {report.reliabilityScore}/100 Reliability Score
          </span>
        </div>
        <p className="text-sm text-rose-950/90 dark:text-rose-100/90 leading-relaxed">
          {report.reliabilityStatement}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* URL Input & Inspection Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-amber-700 dark:text-amber-400 mb-2">
            Product Webpage Inspector · Amazon.in, Flipkart & Any Storefront URL
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight text-balance mb-2.5">
            Paste any product link for an instant summary and reliability verdict.
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
            ReviewLens opens the target webpage on the server, extracts structured specifications and pricing, cross-checks buyer sentiment and discount claims, and tells you plainly whether the item is reliable to buy—alongside safer alternatives from our audited catalog.
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Paste any Amazon.in, Flipkart, Croma, or brand product URL (https://...)"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl pl-10 pr-9 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
            />
            {urlInput && !analyzing && (
              <button
                type="button"
                onClick={() => {
                  setUrlInput("");
                  setErrorMsg(null);
                  inputRef.current?.focus();
                }}
                aria-label="Clear URL input"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={analyzing}
            className="px-6 py-3 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Inspecting Link...</span>
              </>
            ) : (
              <>
                <span>Inspect Product</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="font-semibold text-rose-900 dark:text-rose-100 hover:underline whitespace-nowrap cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick-Try Sample Links */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">
            Try a sample link:
          </span>
          {SAMPLE_LINKS.map((sample) => (
            <button
              key={sample.url}
              type="button"
              disabled={analyzing}
              onClick={() => {
                setUrlInput(sample.url);
                void runInspection(sample.url);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {sample.label} · <span className="text-slate-500 dark:text-slate-400">{sample.store}</span>
            </button>
          ))}
        </div>

        {/* Recent Session Inspections */}
        {recentReports.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5" /> Recent:
              </span>
              {recentReports.map((rec) => {
                const isCurrent = activeReport?.finalUrl === rec.finalUrl;
                return (
                  <button
                    key={`${rec.finalUrl}-${rec.checkedAt}`}
                    type="button"
                    onClick={() => {
                      setActiveReport(rec);
                      setUrlInput(rec.submittedUrl);
                      setErrorMsg(null);
                      setSaveNotice(null);
                    }}
                    className={`px-2.5 py-1 rounded-md transition-colors max-w-[220px] truncate cursor-pointer tabular-nums ${
                      isCurrent
                        ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
                        : "hover:text-slate-900 dark:hover:text-white underline-offset-2 hover:underline"
                    }`}
                  >
                    {rec.productName} ({rec.reliabilityScore}/100)
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={clearRecentHistory}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear History
            </button>
          </div>
        )}
      </section>

      {/* Multi-Stage Skeleton While Inspecting */}
      {analyzing && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2.5">
            {INSPECTION_STEPS.map((label, idx) => {
              const done = idx < stepIndex;
              const current = idx === stepIndex;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-2.5 text-xs ${
                    current
                      ? "text-slate-900 dark:text-white font-semibold"
                      : done
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : current ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <span className="w-4 h-4 inline-flex items-center justify-center font-mono text-[11px] shrink-0">
                      0{idx + 1}
                    </span>
                  )}
                  <span>{label}</span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800 animate-pulse">
            <div className="lg:col-span-4 aspect-[4/3] bg-slate-100 dark:bg-slate-800 rounded-xl" />
            <div className="lg:col-span-8 space-y-4">
              <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-7 w-4/5 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-24 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />
              <div className="h-10 w-3/5 bg-slate-100 dark:bg-slate-800 rounded-lg" />
            </div>
          </div>
        </section>
      )}

      {/* Empty Zero-State Guidance */}
      {!analyzing && !activeReport && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-xs font-mono text-amber-700 dark:text-amber-400 mb-1.5">01. Open & Extract</div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Direct Page & Schema Inspection
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Follows redirects and extracts Schema.org product metadata, pricing, ratings, and hardware specifications directly from the listing.
              </p>
            </div>
            <div className="md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-6">
              <div className="text-xs font-mono text-amber-700 dark:text-amber-400 mb-1.5">02. Cross-Check Claims</div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Clear Reliability Statement
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Flags inflated MRP discounts, thin review counts, bot-blocked pages, and recurring buyer complaints to give a clear buy or caution verdict.
              </p>
            </div>
            <div className="md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-6">
              <div className="text-xs font-mono text-amber-700 dark:text-amber-400 mb-1.5">03. Compare & Save</div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Safer Alternatives & 1-Click Save
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Surfaces higher-trust alternatives in the same category and INR budget, and lets you save any analyzed link straight to your Shortlist or Compare tray.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Populated Analysis Report */}
      {!analyzing && activeReport && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="space-y-6"
        >
          {/* Contiguous Product Summary & Verdict Hero */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 4:3 Product Visual */}
              <div className="lg:col-span-4 space-y-3">
                <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white">
                  <ProductArtwork
                    imageUrl={activeReport.imageUrl}
                    category={activeReport.category}
                    brand={activeReport.brand}
                    model={activeReport.model}
                    deviceType={activeReport.category}
                    productName={activeReport.productName}
                    specs={activeReport.specs}
                  />
                </div>

                {/* Clean Unboxed Technical Provenance Line */}
                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 tabular-nums">
                  <span>
                    Page open:{" "}
                    <strong className="font-medium text-slate-700 dark:text-slate-200">
                      {activeReport.pageFetchStatus === "opened"
                        ? "Direct HTML + Schema"
                        : activeReport.pageFetchStatus === "bot_protected"
                          ? "Bot-wall bypassed"
                          : "URL & Web signals"}
                    </strong>
                  </span>
                  <a
                    href={activeReport.finalUrl || activeReport.submittedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200 hover:text-amber-700 dark:hover:text-amber-400 whitespace-nowrap"
                  >
                    Open {activeReport.storeLabel} <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Right Contiguous Verdict & Summary */}
              <div className="lg:col-span-8 space-y-4">
                <div>
                  {/* Zero-Pill Unboxed Metadata Line */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {activeReport.storeLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeReport.category}</span>
                    {activeReport.brand && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{activeReport.brand}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{activeReport.externalId}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {activeReport.analysisMode === "live_grounded"
                        ? "Web-Grounded Analysis"
                        : "Page Schema & Heuristic Check"}
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug text-balance">
                    {activeReport.productName}
                  </h2>

                  {/* Price & Rating Baseline */}
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 mt-2.5 tabular-nums">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {activeReport.price !== null
                        ? `₹${activeReport.price.toLocaleString("en-IN")}`
                        : "Price on Storefront"}
                    </span>
                    {activeReport.mrp && activeReport.price && activeReport.mrp > activeReport.price && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="line-through mr-1.5">
                          MRP ₹{activeReport.mrp.toLocaleString("en-IN")}
                        </span>
                        <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          {activeReport.discountPercent}% off
                        </strong>
                      </span>
                    )}
                    {activeReport.rating !== null && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                        <strong className="font-semibold text-slate-900 dark:text-white">
                          {activeReport.rating.toFixed(1)}
                        </strong>
                        {activeReport.reviewCount !== null && (
                          <span>({activeReport.reviewCount.toLocaleString("en-IN")} ratings)</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Explicit Reliability Statement Banner */}
                {renderVerdictBanner(activeReport)}

                {/* Executive Item Summary */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Product Summary
                  </h3>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {activeReport.summary}
                  </p>
                </div>

                {/* 1-Click Workspace Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
                  {matchedId ? (
                    <button
                      type="button"
                      onClick={() => onSelectProductById(matchedId)}
                      className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Open in Catalog Audit</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={savingToCatalog}
                      onClick={handleSaveToCatalogClick}
                      className="px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-300 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {savingToCatalog ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      )}
                      <span>Save to Catalog</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={savingToCatalog}
                    onClick={handleShortlistAnalyzed}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isShortlisted
                        ? "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isShortlisted ? "fill-rose-600 dark:fill-rose-400" : ""}`} />
                    <span>{isShortlisted ? "Shortlisted" : "Save to Shortlist"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={savingToCatalog}
                    onClick={handleCompareAnalyzed}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isCompared ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{isCompared ? "In Compare Tray" : "Add to Compare"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void runInspection(activeReport.submittedUrl)}
                    className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-check Link</span>
                  </button>
                </div>

                {saveNotice && (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {saveNotice}
                  </p>
                )}
              </div>
            </div>

            {/* Pros, Cons & Forensic Signals Breakdown */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Pros & Cons */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Confirmed Strengths (Pros)
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {activeReport.pros.map((pro, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Watchouts & Caveats (Cons)
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {activeReport.cons.map((con, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Extracted Key Specifications Table */}
                {specEntries.length > 0 && (
                  <div className="sm:col-span-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                      Detected Key Specifications
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      {specEntries.slice(0, 8).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80"
                        >
                          <span className="text-slate-500 dark:text-slate-400 truncate">{k}</span>
                          <span className="font-medium text-slate-900 dark:text-slate-100 text-right tabular-nums">
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reliability Signals, Red Flags & Grounding Citations */}
              <div className="lg:col-span-5 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-6 space-y-4">
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Reliability Signals & Red Flag Checks
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeReport.signals.map((sig, idx) => (
                      <div key={idx} className="py-2.5 first:pt-0 last:pb-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          {sig.severity === "high" ? (
                            <>
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                              <span className="text-rose-700 dark:text-rose-300">{sig.label}</span>
                            </>
                          ) : sig.severity === "medium" ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="text-amber-800 dark:text-amber-300">{sig.label}</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="text-emerald-800 dark:text-emerald-300">{sig.label}</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-5">
                          {sig.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {activeReport.sources.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" /> Grounded Web Sources
                    </h4>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
                      {activeReport.sources.map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 hover:text-amber-700 dark:hover:text-amber-400 underline underline-offset-2 max-w-[230px] truncate"
                        >
                          <span className="truncate">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {activeReport.analysisMode === "local_heuristic" && activeReport.fallbackReason && (
                  <p className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Evaluated locally from live page metadata, URL structure, and audited catalog signals. Attach a valid <code className="font-mono">GEMINI_API_KEY</code> in Settings &gt; Secrets to add live web-search grounding.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Better & Safer Verified Catalog Alternatives */}
          {activeReport.alternatives.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeReport.verdict === "reliable"
                      ? `Compare Against Top-Audited ${activeReport.category} Alternatives`
                      : `Higher-Trust ${activeReport.category} Alternatives in Our Audited Catalog`}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Verified listings with strong genuine-review patterns in the same department and price band.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeReport.alternatives.map((alt: CatalogAlternativeItem) => {
                  const altCompared = compareIds.includes(alt.productId);
                  return (
                    <article
                      key={alt.productId}
                      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl overflow-hidden flex flex-col justify-between transition-colors"
                    >
                      <div>
                        <div
                          onClick={() => onSelectProductById(alt.productId)}
                          className="relative aspect-[4/3] w-full border-b border-slate-100 dark:border-slate-800 cursor-pointer"
                        >
                          <ProductArtwork
                            imageUrl={alt.imageUrl}
                            remoteImageUrl={alt.remoteImageUrl}
                            category={alt.category}
                            brand={alt.brand}
                            model={alt.model}
                            deviceType={alt.category}
                            productName={alt.productName}
                          />
                        </div>

                        <div className="p-4 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {alt.brand ?? "Verified"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {alt.genuinePercent}% genuine
                            </span>
                          </div>

                          <h3
                            onClick={() => onSelectProductById(alt.productId)}
                            className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 line-clamp-2 leading-snug cursor-pointer"
                          >
                            {alt.productName}
                          </h3>

                          <div className="flex items-baseline gap-2 pt-1 tabular-nums">
                            <span className="text-base font-bold text-slate-900 dark:text-white">
                              {alt.price !== null ? `₹${alt.price.toLocaleString("en-IN")}` : "Check Price"}
                            </span>
                            {alt.mrp && alt.price && alt.mrp > alt.price && (
                              <span className="text-xs text-slate-400 line-through">
                                ₹{alt.mrp.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 tabular-nums">
                            {alt.matchReason}
                          </p>
                        </div>
                      </div>

                      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleCompare(alt.productId)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
                        >
                          {altCompared ? (
                            <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{altCompared ? "Comparing" : "Compare"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectProductById(alt.productId)}
                          className="text-xs font-semibold text-slate-900 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 whitespace-nowrap cursor-pointer"
                        >
                          Inspect Audit →
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </motion.div>
      )}
    </div>
  );
};
