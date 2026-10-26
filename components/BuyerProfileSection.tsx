"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  Heart,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { ComputedBuyerProfile } from "@/lib/buyerProfile";
import type { ProductRecord, ReviewRecord } from "@/lib/types";
import type { AuthenticatedSessionUser } from "./LoginScreen";
import { ProductCard, type ProductSnapshotSummary } from "./ProductCard";

interface CatalogEntry {
  product: ProductRecord;
  snapshot: ProductSnapshotSummary | null;
  reviews?: ReviewRecord[];
}

interface BuyerProfileSectionProps {
  user: AuthenticatedSessionUser;
  supabaseConfigured: boolean;
  initialSubTab?: "taste" | "shortlist" | "schema";
  buyerProfile: Omit<ComputedBuyerProfile, "recommendations"> & {
    recommendations: { entry: CatalogEntry; matchScore: number; matchReasons: string[] }[];
  };
  shortlistedItems: CatalogEntry[];
  compareIds: string[];
  shortlistIds: string[];
  onSelectProduct: (product: ProductRecord) => void;
  onSelectProductById: (productId: string) => void;
  onToggleCompare: (productId: string) => void;
  onToggleShortlist: (productId: string) => void;
  onClearShortlist: () => void;
  onApplyForYouSort: () => void;
  onBrowseCategory: (category: string) => void;
  onBrowseBrand: (brand: string) => void;
  onBrowseCatalog: () => void;
  onUpdatePreferences: (prefs: {
    displayName?: string;
    mutedCategories?: string[];
    strictTrustMode?: boolean;
  }) => Promise<void>;
}

const SUPABASE_MIGRATION_SQL = `-- Run in Supabase Dashboard -> SQL Editor (supabase/0003_auth_profiles_favorites.sql)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  email text,
  display_name text,
  muted_categories text[] not null default '{}',
  strict_trust_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  interaction_type text not null check (interaction_type in ('shortlist', 'compare')),
  created_at timestamptz not null default now(),
  unique (user_id, product_id, interaction_type)
);

alter table public.profiles enable row level security;
alter table public.user_favorites enable row level security;

create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own favorites" on public.user_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export const BuyerProfileSection: React.FC<BuyerProfileSectionProps> = ({
  user,
  supabaseConfigured,
  initialSubTab = "taste",
  buyerProfile,
  shortlistedItems,
  compareIds,
  shortlistIds,
  onSelectProduct,
  onSelectProductById,
  onToggleCompare,
  onToggleShortlist,
  onClearShortlist,
  onApplyForYouSort,
  onBrowseCategory,
  onBrowseBrand,
  onBrowseCatalog,
  onUpdatePreferences,
}) => {
  const [subTab, setSubTab] = useState<"taste" | "shortlist" | "schema">(initialSubTab);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(user.displayName || user.username);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

  const mutedCategories = useMemo(
    () => user.mutedCategories ?? [],
    [user.mutedCategories],
  );
  const strictTrustMode = Boolean(user.strictTrustMode);

  const callbackUrl =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "/auth/callback";

  const handleToggleMuteCategory = async (category: string) => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    const nextMuted = mutedCategories.includes(category)
      ? mutedCategories.filter((c) => c !== category)
      : [...mutedCategories, category];
    try {
      await onUpdatePreferences({ mutedCategories: nextMuted });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleStrictTrust = async () => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    try {
      await onUpdatePreferences({ strictTrustMode: !strictTrustMode });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPrefs) return;
    setSavingPrefs(true);
    try {
      await onUpdatePreferences({ displayName: draftName.trim() || user.username });
      setEditingName(false);
    } finally {
      setSavingPrefs(false);
    }
  };

  const copyText = async (text: string, which: "sql" | "callback") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "sql") {
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2000);
      } else {
        setCopiedCallback(true);
        setTimeout(() => setCopiedCallback(false), 2000);
      }
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const topActiveCategory =
    buyerProfile.categoryAffinities.find((c) => !c.muted) ?? buyerProfile.categoryAffinities[0];
  const topBrandsLabel =
    buyerProfile.brandAffinities.length > 0
      ? buyerProfile.brandAffinities
          .slice(0, 3)
          .map((b) => b.brand)
          .join(" · ")
      : "Save items to detect";

  return (
    <div className="space-y-6">
      {/* Top Account & Persona Banner */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                @{user.username}
              </span>
              {user.email && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{user.email}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {user.authProvider === "supabase"
                  ? "Connected via Supabase Auth"
                  : supabaseConfigured
                    ? "Demo Workspace Session"
                    : "Preview Profile Store"}
              </span>
            </div>

            {editingName ? (
              <form onSubmit={handleSaveDisplayName} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={draftName}
                  maxLength={48}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={savingPrefs}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(user.displayName || user.username);
                    setEditingName(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                  {buyerProfile.personaTitle}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(user.displayName || user.username);
                    setEditingName(true);
                  }}
                  className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  Edit display name ({user.displayName || user.username})
                </button>
              </div>
            )}

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {buyerProfile.personaSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={savingPrefs}
              onClick={handleToggleStrictTrust}
              className={`px-3.5 py-2.5 min-h-[40px] text-xs font-semibold rounded-xl border inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                strictTrustMode
                  ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 border-slate-900 dark:border-amber-400"
                  : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Strict Trust Filter (85%+ Genuine)</span>
            </button>

            <button
              type="button"
              onClick={onApplyForYouSort}
              className="px-4 py-2.5 min-h-[40px] text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Rank Catalog For Me</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Column Buyer DNA Quantitative Strip */}
        <div className="border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 tabular-nums">
          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Primary Department Affinity
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              {topActiveCategory ? topActiveCategory.category : "No favourites yet"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {topActiveCategory
                ? `${topActiveCategory.sharePercent}% taste share · ${topActiveCategory.shortlistCount} saved`
                : "Heart any catalog item to start"}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              INR Budget Sweet Spot
            </div>
            <div className="font-mono text-lg font-bold text-slate-900 dark:text-white mt-1">
              {buyerProfile.budget
                ? `${formatInr(buyerProfile.budget.p25Inr)} – ${formatInr(buyerProfile.budget.p75Inr)}`
                : "—"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {buyerProfile.budget
                ? `Median ${formatInr(buyerProfile.budget.medianInr)} · ${buyerProfile.budget.bracketLabel}`
                : "Calculated across Amazon.in & Flipkart"}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Review Authenticity Baseline
            </div>
            <div className="font-mono text-lg font-bold text-slate-900 dark:text-white mt-1">
              {buyerProfile.trust ? `${buyerProfile.trust.avgGenuinePercent}% Genuine` : "—"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {buyerProfile.trust
                ? buyerProfile.trust.dealSensitivityLabel
                : "Forensic shill-ring adjusted"}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Preferred Brands ({buyerProfile.brandAffinities.length})
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate">
              {topBrandsLabel}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {buyerProfile.shortlistCount} shortlisted · {buyerProfile.compareCount} in compare
            </div>
          </div>
        </div>
      </section>

      {/* Functional Section Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl tabular-nums">
          <button
            type="button"
            onClick={() => setSubTab("taste")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === "taste"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Buyer Profile & Matches ({buyerProfile.recommendations.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("shortlist")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === "shortlist"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Saved Shortlist ({shortlistedItems.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("schema")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              subTab === "schema"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Supabase SQL Setup</span>
          </button>
        </div>

        {subTab === "shortlist" && shortlistedItems.length > 0 && (
          <button
            type="button"
            onClick={onClearShortlist}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg cursor-pointer whitespace-nowrap"
          >
            Clear Shortlist
          </button>
        )}
      </div>

      {/* Sub-Tab 1: Buyer Profile & Personalized Matches */}
      {subTab === "taste" && (
        <>
          {!buyerProfile.hasSignals ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto">
              <SlidersHorizontal className="w-9 h-9 text-slate-400 dark:text-slate-500 mx-auto mb-3 stroke-[1.5]" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                Save Favourite Products to Generate Your Buyer Profile
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                Tap the heart icon on any smartphone, laptop, audio product, or appliance in the catalog. ReviewLens automatically computes your department weights, INR budget sweet spot, and authenticity threshold.
              </p>
              <button
                type="button"
                onClick={onBrowseCatalog}
                className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
              >
                Explore 30-Item Catalog
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* 2-Column Relational Affinity Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Department Affinity Table with Mute Controls */}
                <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Department Taste Distribution
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Weighted from shortlisted items (3 pts) and active comparisons (2 pts). Mute a department to exclude it from recommendations.
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                    {buyerProfile.categoryAffinities.map((cat) => (
                      <div
                        key={cat.category}
                        className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          cat.muted ? "opacity-55" : ""
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {cat.category}
                              {cat.muted ? " (Muted)" : ""}
                            </span>
                            <span className="font-mono text-slate-600 dark:text-slate-300">
                              {cat.sharePercent}% share · {cat.shortlistCount} saved
                              {cat.compareCount > 0 ? ` · ${cat.compareCount} compared` : ""}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${Math.max(6, cat.sharePercent)}%` }}
                              className={`h-full rounded-full ${
                                cat.muted
                                  ? "bg-slate-400 dark:bg-slate-600"
                                  : "bg-slate-900 dark:bg-amber-400"
                              }`}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onBrowseCategory(cat.category)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:underline whitespace-nowrap cursor-pointer"
                          >
                            Shop
                          </button>
                          <button
                            type="button"
                            disabled={savingPrefs}
                            onClick={() => handleToggleMuteCategory(cat.category)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                          >
                            {cat.muted ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>Include</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>Mute</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Brand Affinity & Watchlist Alerts */}
                <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                  <div className="p-6 space-y-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Brand Affinity
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Brands recurring across your saved hardware research.
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 tabular-nums">
                      {buyerProfile.brandAffinities.slice(0, 6).map((b) => (
                        <div
                          key={b.brand}
                          className="py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {b.brand}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {" "}
                              · {b.itemCount} {b.itemCount === 1 ? "item" : "items"} ·{" "}
                              {b.avgGenuinePercent}% genuine avg
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onBrowseBrand(b.brand)}
                            className="font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Filter Brand
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Watchlist Alerts */}
                  <div className="p-6 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Saved Item Signals ({buyerProfile.watchlistAlerts.length})
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Verified discounts and review-authenticity warnings across your favourites.
                      </p>
                    </div>

                    {buyerProfile.watchlistAlerts.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        All saved items show normal review patterns with no elevated shill-ring flags.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {buyerProfile.watchlistAlerts.map((alert) => (
                          <div key={alert.productId} className="py-3 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                                {alert.alertType === "suspicion_watch" ? (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                )}
                                <span className="line-clamp-1">{alert.productName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onSelectProductById(alert.productId)}
                                className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Inspect
                              </button>
                            </div>
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                              {alert.headline}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {alert.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Matched to Your Favourites Recommendations */}
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      Matched to Your Favourites
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Unsaved catalog products matching your preferred departments, INR budget range, and review-authenticity baseline.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onApplyForYouSort}
                    className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>View full catalog ranked For You</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {buyerProfile.recommendations.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Unmute at least one department or broaden your Strict Trust Filter to view additional catalog matches.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {buyerProfile.recommendations.map(({ entry, matchScore, matchReasons }) => (
                      <div key={entry.product.id} className="flex flex-col gap-1.5">
                        <div className="px-1 text-xs text-slate-600 dark:text-slate-300 truncate tabular-nums">
                          <strong className="font-mono text-slate-900 dark:text-amber-400">
                            {matchScore}% match
                          </strong>
                          {matchReasons.length > 0 && ` · ${matchReasons.join(" · ")}`}
                        </div>
                        <ProductCard
                          product={entry.product}
                          snapshot={entry.snapshot}
                          reviewCountLoaded={entry.reviews?.length}
                          viewMode="grid"
                          isCompared={compareIds.includes(entry.product.id)}
                          isShortlisted={shortlistIds.includes(entry.product.id)}
                          onSelect={onSelectProduct}
                          onToggleCompare={onToggleCompare}
                          onToggleShortlist={onToggleShortlist}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {/* Sub-Tab 2: Saved Shortlist */}
      {subTab === "shortlist" && (
        <div>
          {shortlistedItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto my-4">
              <Heart className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-3 stroke-[1.5]" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                Your Shortlist is Empty
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                Tap the heart icon on any of the 30 catalog items to save it here and sharpen your Buyer Profile.
              </p>
              <button
                type="button"
                onClick={onBrowseCatalog}
                className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
              >
                Browse 30-Item Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {shortlistedItems.map(({ product, snapshot, reviews }) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  snapshot={snapshot}
                  reviewCountLoaded={reviews?.length}
                  viewMode="grid"
                  isCompared={compareIds.includes(product.id)}
                  isShortlisted={true}
                  onSelect={onSelectProduct}
                  onToggleCompare={onToggleCompare}
                  onToggleShortlist={onToggleShortlist}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Supabase Relational Schema & Setup Guide */}
      {subTab === "schema" && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Connect Your Supabase Project (@supabase/ssr + RLS)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-relaxed">
                ReviewLens is wired with <span className="font-mono">@supabase/ssr</span> cookie refresh middleware, OAuth & OTP callback exchange, and relational <span className="font-mono">profiles</span> + <span className="font-mono">user_favorites</span> sync. Complete these 3 steps in your Supabase Dashboard:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 text-xs">
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-white">
                  01. Add Project Secrets
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Set <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
                  <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> (plus optional{" "}
                  <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>) in your environment variables.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-white">
                  02. Allow Redirect Callback URL
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  In Supabase Auth → URL Configuration → Redirect URLs, add:
                </p>
                <div className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-[11px]">
                  <span className="truncate">{callbackUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyText(callbackUrl, "callback")}
                    className="text-amber-700 dark:text-amber-400 font-sans font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedCallback ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-white">
                  03. Run Relational SQL Migration
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Paste <span className="font-mono">supabase/0003_auth_profiles_favorites.sql</span> below into the Supabase SQL Editor to create RLS-protected tables and Realtime sync.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                supabase/0003_auth_profiles_favorites.sql
              </span>
              <button
                type="button"
                onClick={() => copyText(SUPABASE_MIGRATION_SQL, "sql")}
                className="px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Copied SQL</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
              {SUPABASE_MIGRATION_SQL}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
};
