"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Download,
  SlidersHorizontal,
  ArrowUpRight,
} from "lucide-react";
import type { AblationBenchmarkReport, BenchmarkCohort, ModelMetrics } from "@/lib/evaluation";
import type { CatalogForensicsSummary } from "@/lib/forensics";

interface EvaluationSectionProps {
  onSelectProductById: (productId: string) => void;
}

const COHORT_LABELS: Record<BenchmarkCohort | "all", string> = {
  all: "All 40 Labeled Samples",
  genuine_praise: "Genuine Praise (10)",
  honest_critical: "Honest Critical Defects (8)",
  incentivized_spam: "Cashback / Promo Spam (8)",
  bot_template_cluster: "3-Gram Bot Cluster (8)",
  star_tap_mismatch: "Accidental Star-Tap Mismatch (6)",
};

export const EvaluationSection: React.FC<EvaluationSectionProps> = ({ onSelectProductById }) => {
  const [subView, setSubView] = useState<"ablation" | "shill_forensics">("ablation");
  const [threshold, setThreshold] = useState<number>(0.33);
  const [cohortFilter, setCohortFilter] = useState<BenchmarkCohort | "all">("all");
  const [loading, setLoading] = useState(true);
  const [runningLive, setRunningLive] = useState(false);

  const [mode, setMode] = useState<"reference" | "live_gemini">("reference");
  const [liveFallbackReason, setLiveFallbackReason] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string>("gemini-3.8-flash");
  const [benchmark, setBenchmark] = useState<AblationBenchmarkReport | null>(null);
  const [catalogForensics, setCatalogForensics] = useState<CatalogForensicsSummary | null>(null);
  const [cacheStats, setCacheStats] = useState<{
    cachedEntries: number;
    hits: number;
    misses: number;
    hitRatePercent: number;
  } | null>(null);

  const loadEvaluation = useCallback(async (thresh: number) => {
    try {
      const res = await fetch(`/api/evaluation?threshold=${thresh.toFixed(2)}`);
      const data = await res.json();
      if (data.benchmark) setBenchmark(data.benchmark);
      if (data.catalogForensics) setCatalogForensics(data.catalogForensics);
      if (data.cacheStats) setCacheStats(data.cacheStats);
      if (data.model) setModelName(data.model);
      setMode(data.mode === "live_gemini" ? "live_gemini" : "reference");
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvaluation(threshold);
  }, [threshold, loadEvaluation]);

  const handleRunLiveGeminiPass = async () => {
    setRunningLive(true);
    setLiveFallbackReason(null);
    try {
      const res = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      const data = await res.json();
      if (data.benchmark) setBenchmark(data.benchmark);
      if (data.catalogForensics) setCatalogForensics(data.catalogForensics);
      if (data.cacheStats) setCacheStats(data.cacheStats);
      if (data.model) setModelName(data.model);
      const nextMode = data.mode === "live_gemini" ? "live_gemini" : "reference";
      setMode(nextMode);
      if (nextMode !== "live_gemini") {
        setLiveFallbackReason(data.fallbackReason ?? "service_unavailable");
      }
    } catch {
      // Keep existing benchmark
    } finally {
      setRunningLive(false);
    }
  };

  const handleExportBenchmarkJson = () => {
    if (!benchmark) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            evaluationMode: mode,
            model: modelName,
            cacheStats,
            ablationReport: benchmark,
            catalogForensics,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `reviewlens-ablation-benchmark-${threshold.toFixed(2)}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredSamples = useMemo(() => {
    if (!benchmark) return [];
    if (cohortFilter === "all") return benchmark.samples;
    return benchmark.samples.filter((s) => s.cohort === cohortFilter);
  }, [benchmark, cohortFilter]);

  if (loading && !benchmark) {
    return (
      <div className="py-20 text-center text-xs text-slate-500 dark:text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-600 dark:text-slate-300" />
        Computing ground-truth ablation metrics and cross-catalog shill graph...
      </div>
    );
  }

  const modelCards: ModelMetrics[] = benchmark
    ? [
        benchmark.models.heuristicsOnly,
        benchmark.models.geminiOnly,
        benchmark.models.hybridEnsemble,
      ]
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header & Sub-View Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
            Evaluation Benchmarks & Catalog Shill-Ring Forensics
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
            Empirical 3-way ablation study across 40 labeled ground-truth reviews (measuring Precision, Recall, F1, and Honest-Critical False Positive Rate) alongside graph forensics across all 30 products and 180 catalog reviews.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
            <button
              type="button"
              onClick={() => setSubView("ablation")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subView === "ablation"
                  ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-amber-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              3-Way Ablation Suite (N=40)
            </button>
            <button
              type="button"
              onClick={() => setSubView("shill_forensics")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subView === "shill_forensics"
                  ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-amber-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Shill-Ring & Inflation Audit (180)
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportBenchmarkJson}
            className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-400 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
        </div>
      </div>

      {/* =====================================================================
          SUB-VIEW 1: 3-WAY ABLATION STUDY & INTERACTIVE THRESHOLD CALIBRATION
         ===================================================================== */}
      {subView === "ablation" && benchmark && (
        <div className="space-y-6">
          {/* Threshold Calibration Bar + Live Gemini Pass + SHA-256 Cache Telemetry */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 tabular-nums">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Decision Risk Threshold:{" "}
                    <strong className="font-mono text-sm text-slate-900 dark:text-amber-400">
                      {threshold.toFixed(2)}
                    </strong>
                    {threshold === 0.33 && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        (Production Operating Point)
                      </span>
                    )}
                  </span>
                  {threshold !== 0.33 && (
                    <button
                      type="button"
                      onClick={() => setThreshold(0.33)}
                      className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      Reset to 0.33
                    </button>
                  )}
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={0.65}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  aria-label="Decision risk threshold"
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                  <span>0.20 (Aggressive recall)</span>
                  <span>0.33 (Balanced F1 optimum)</span>
                  <span>0.65 (Conservative precision)</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-6">
                {cacheStats && (
                  <div className="text-xs space-y-0.5">
                    <span className="text-slate-500 dark:text-slate-400 block">
                      SHA-256 Content-Hash Cache
                    </span>
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {cacheStats.cachedEntries} entries · {cacheStats.hits} hits ({cacheStats.hitRatePercent}%)
                    </strong>
                  </div>
                )}

                <button
                  type="button"
                  disabled={runningLive}
                  onClick={handleRunLiveGeminiPass}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  {runningLive && <Loader2 className="w-4 h-4 animate-spin" />}
                  {runningLive
                    ? `Evaluating 40 Samples via ${modelName}...`
                    : mode === "live_gemini"
                      ? "Re-Run Live Gemini Benchmark"
                      : "Run Live Gemini Verification Pass"}
                </button>
              </div>
            </div>

            {liveFallbackReason && mode !== "live_gemini" && (
              <p className="pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {liveFallbackReason === "missing_api_key" || liveFallbackReason === "invalid_api_key" ? (
                  <>
                    Showing calibrated N=40 reference benchmark — configure a valid{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      GEMINI_API_KEY
                    </span>{" "}
                    in <strong className="font-semibold text-slate-700 dark:text-slate-200">Settings &gt; Secrets</strong>{" "}
                    to run live Gemini inference passes.
                  </>
                ) : (
                  <>
                    Showing calibrated N=40 reference benchmark — live Gemini API is momentarily rate-limited or busy.
                  </>
                )}
              </p>
            )}
          </div>

          {/* 3-Way Model Ablation Comparison Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 tabular-nums">
            {modelCards.map((m) => {
              const isHybrid = m.modelId === "hybrid_ensemble";
              return (
                <div
                  key={m.modelId}
                  className={`rounded-xl p-5 border space-y-4 ${
                    isHybrid
                      ? "bg-white dark:bg-slate-900 border-slate-900 dark:border-amber-400 shadow-sm"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {m.label}
                      </h3>
                      {isHybrid && (
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          +{benchmark.f1LiftOverHeuristicsPct}% F1 vs Heuristics
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.formula}</p>
                  </div>

                  {/* Primary F1 + Precision + Recall */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        F1 Score
                      </span>
                      <strong
                        className={`text-2xl font-bold ${
                          isHybrid
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {(m.f1Score * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        Precision
                      </span>
                      <strong className="text-lg font-bold text-slate-900 dark:text-white">
                        {(m.precision * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        Recall
                      </span>
                      <strong className="text-lg font-bold text-slate-900 dark:text-white">
                        {(m.recall * 100).toFixed(1)}%
                      </strong>
                    </div>
                  </div>

                  {/* Confusion Matrix (2x2) */}
                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs bg-slate-50 dark:bg-slate-950/70 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 block">TP</span>
                      <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                        {m.confusion.tp}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">TN</span>
                      <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                        {m.confusion.tn}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">FP</span>
                      <strong className="font-mono text-rose-700 dark:text-rose-400">
                        {m.confusion.fp}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">FN</span>
                      <strong className="font-mono text-amber-700 dark:text-amber-400">
                        {m.confusion.fn}
                      </strong>
                    </div>
                  </div>

                  {/* Accuracy & Honest-Critical Buyer Protection Metric */}
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pt-1">
                    <span>Accuracy: {(m.accuracy * 100).toFixed(1)}%</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Honest-Critical FPR:{" "}
                      <strong
                        className={
                          m.honestCriticalFpr === 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }
                      >
                        {(m.honestCriticalFpr * 100).toFixed(1)}%
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-Sample Ground Truth vs Model Predictions Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Per-Sample Ground-Truth Inspection ({filteredSamples.length} shown)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Observe how Heuristics catches 3-gram bot clusters, Gemini protects blunt 1–2★ defect reports, and Star-Prose Alignment isolates accidental star taps.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(COHORT_LABELS) as (BenchmarkCohort | "all")[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCohortFilter(key)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                      cohortFilter === key
                        ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 border-slate-900 dark:border-amber-400 font-semibold"
                        : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400"
                    }`}
                  >
                    {COHORT_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums min-w-[780px]">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-3 font-semibold">ID · Cohort</th>
                    <th className="p-3 font-semibold">Review Sample</th>
                    <th className="p-3 font-semibold text-center">Ground Truth</th>
                    <th className="p-3 font-semibold text-center">Heuristics</th>
                    <th className="p-3 font-semibold text-center">Gemini Only</th>
                    <th className="p-3 font-semibold text-center">Hybrid Ensemble</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredSamples.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-950/40 transition-colors"
                    >
                      <td className="p-3 align-top whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {s.id} · {s.rating}★
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                          {s.cohort.replace(/_/g, " ")}
                        </div>
                      </td>
                      <td className="p-3 align-top max-w-md">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {s.title}
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">
                          {s.text}
                        </p>
                      </td>
                      <td className="p-3 align-top text-center whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            s.groundTruthFlagged
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {s.groundTruthFlagged ? "Segregate" : "Trusted"}
                        </span>
                      </td>
                      <td className="p-3 align-top text-center font-mono whitespace-nowrap">
                        <div
                          className={
                            s.heuristicFlagged === s.groundTruthFlagged
                              ? "text-slate-800 dark:text-slate-200"
                              : "text-rose-600 dark:text-rose-400 font-bold"
                          }
                        >
                          {(s.heuristicScore * 100).toFixed(0)}% ({s.heuristicFlagged ? "Flag" : "Keep"})
                        </div>
                      </td>
                      <td className="p-3 align-top text-center font-mono whitespace-nowrap">
                        <div
                          className={
                            s.geminiFlagged === s.groundTruthFlagged
                              ? "text-slate-800 dark:text-slate-200"
                              : "text-rose-600 dark:text-rose-400 font-bold"
                          }
                        >
                          {(s.geminiScore * 100).toFixed(0)}% ({s.geminiFlagged ? "Flag" : "Keep"})
                        </div>
                      </td>
                      <td className="p-3 align-top text-center font-mono whitespace-nowrap">
                        <div
                          className={`inline-flex items-center gap-1 font-bold ${
                            s.hybridFlagged === s.groundTruthFlagged
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {s.hybridFlagged === s.groundTruthFlagged ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {(s.hybridScore * 100).toFixed(0)}% ({s.hybridFlagged ? "Flag" : "Keep"})
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: CROSS-CATALOG SHILL-RING GRAPH & STAR-INFLATION AUDIT
         ===================================================================== */}
      {subView === "shill_forensics" && catalogForensics && (
        <div className="space-y-6">
          {/* Catalog-Wide Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Catalog Corpus Audited
              </span>
              <strong className="text-2xl font-bold text-slate-900 dark:text-white">
                {catalogForensics.totalReviewsAudited} reviews
              </strong>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Across {catalogForensics.totalProductsAudited} verified India SKUs
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Detected Shill Rings
              </span>
              <strong className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                {catalogForensics.shillRings.length} handles
              </strong>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Multi-product unverified 5★ bursts
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Suspicious / Hype Reviews
              </span>
              <strong className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {catalogForensics.flaggedSpamCount}
              </strong>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Risk score ≥ 0.33 excluded from clean avg
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Star-Prose Mismatches
              </span>
              <strong className="text-2xl font-bold text-slate-900 dark:text-white">
                {catalogForensics.mismatchCount}
              </strong>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Contradictory star tap vs review text
              </span>
            </div>
          </div>

          {/* Detected Cross-Product Shill Rings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Coordinated Cross-Product Shill Handles
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Accounts posting repeated unverified high-risk 5★ promotional reviews across unrelated departments, ranked by average ensemble risk and 3-gram shingle similarity.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tabular-nums">
              {catalogForensics.shillRings.map((ring) => (
                <div
                  key={ring.reviewerHandle}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-sm font-mono text-rose-700 dark:text-rose-400">
                        @{ring.reviewerHandle}
                      </strong>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                        {ring.reviewCount} products targeted · {ring.unverifiedCount} unverified ·{" "}
                        {ring.avgRating.toFixed(1)}★ avg rating
                      </div>
                    </div>
                    <div className="text-right">
                      <strong className="text-sm font-mono text-rose-700 dark:text-rose-400 block">
                        {Math.round(ring.avgRisk * 100)}% avg risk
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        {Math.round(ring.templateSimilarity * 100)}% template sim
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                    {ring.productsTargeted.map((pt) => (
                      <button
                        key={`${ring.reviewerHandle}-${pt.productId}`}
                        type="button"
                        onClick={() => onSelectProductById(pt.productId)}
                        className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 transition-colors cursor-pointer"
                      >
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {pt.brand ? `${pt.brand} · ` : ""}
                          {pt.productName}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-slate-500 dark:text-amber-400 shrink-0">
                          {pt.rating}★ ({Math.round(pt.risk * 100)}%)
                          <ArrowUpRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Star-Inflation Leaderboard */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Star-Rating Inflation & Adjustment Leaderboard
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compares raw sample star averages against Genuine-Adjusted Star Scores after filtering incentivized 5★ spam and accidental star-tap mismatches. Click any product to inspect its reviews.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums min-w-[700px]">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-3.5 font-semibold">Product</th>
                    <th className="p-3.5 font-semibold">Department</th>
                    <th className="p-3.5 font-semibold text-right">Raw Sample Avg</th>
                    <th className="p-3.5 font-semibold text-right">Genuine-Adjusted</th>
                    <th className="p-3.5 font-semibold text-right">Inflation Shift</th>
                    <th className="p-3.5 font-semibold text-right">Flagged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {catalogForensics.inflationLeaderboard.slice(0, 15).map((row) => (
                    <tr
                      key={row.productId}
                      onClick={() => onSelectProductById(row.productId)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-950/60 transition-colors cursor-pointer"
                    >
                      <td className="p-3.5 font-medium text-slate-900 dark:text-white max-w-xs truncate">
                        {row.brand ? `${row.brand} — ` : ""}
                        {row.productName}
                      </td>
                      <td className="p-3.5 text-slate-500 dark:text-slate-400">{row.category}</td>
                      <td className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {row.rawAvgRating.toFixed(2)}★
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {row.genuineAvgRating.toFixed(2)}★
                      </td>
                      <td
                        className={`p-3.5 text-right font-mono font-semibold ${
                          row.inflationDelta > 0
                            ? "text-rose-700 dark:text-rose-400"
                            : row.inflationDelta < 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-slate-500"
                        }`}
                      >
                        {row.inflationDelta > 0
                          ? `+${row.inflationDelta.toFixed(2)}★ inflated`
                          : row.inflationDelta < 0
                            ? `${Math.abs(row.inflationDelta).toFixed(2)}★ under-rated`
                            : "0.00★"}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                        {row.flaggedCount}/{row.totalReviews}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
