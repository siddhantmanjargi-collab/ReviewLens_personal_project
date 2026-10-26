"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  X,
  LayoutGrid,
  List,
  SlidersHorizontal,
  RotateCcw,
  Star,
  Heart,
  Scale,
  ArrowRight,
  CheckSquare,
  Square,
} from "lucide-react";
import type { ProductRecord, ReviewRecord } from "@/lib/types";
import { computeBuyerProfile, computeForYouCatalogScores } from "@/lib/buyerProfile";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Header, type ActiveSection } from "@/components/Header";
import { LoginScreen, type AuthenticatedSessionUser } from "@/components/LoginScreen";
import { BuyerProfileSection } from "@/components/BuyerProfileSection";
import { ProductCard, type ProductSnapshotSummary } from "@/components/ProductCard";
import { ProductDetailModal } from "@/components/ProductDetailModal";
import { CompareSection } from "@/components/CompareSection";
import { LinkAnalyzerSection } from "@/components/LinkAnalyzerSection";
import { heroShowcaseImg } from "@/components/ProductArtwork";

const SESSION_TOKEN_STORAGE_KEY = "rl_session_token";

interface CatalogItem {
  product: ProductRecord;
  snapshot: ProductSnapshotSummary | null;
  reviews?: ReviewRecord[];
  reviewAnalyses?: Record<string, any>;
}

type PriceBracket = "all" | "under_2500" | "2500_10000" | "10000_35000" | "over_35000";
type RatingFilter = "all" | "4.0" | "4.5";
type DiscountFilter = "all" | "15" | "30" | "50";
type TrustFilter = "all" | "genuine_90" | "genuine_80" | "flagged";
type SortOption =
  | "for_you"
  | "popularity"
  | "price_asc"
  | "price_desc"
  | "rating_desc"
  | "discount_desc"
  | "trust_desc"
  | "risk_desc";

const CATEGORIES_ORDER = [
  "Smartphones",
  "Laptops",
  "Audio",
  "Wearables",
  "Tablets",
  "Appliances",
  "Accessories",
  "Storage & Wi-Fi",
  "Cameras",
  "TV & Lifestyle",
];

export default function StorefrontPage() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState<AuthenticatedSessionUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);

  const [activeSection, setActiveSection] = useState<ActiveSection>("catalog");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Storefront search, category, faceted filters, sort & view state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [priceBracket, setPriceBracket] = useState<PriceBracket>("all");
  const [minRating, setMinRating] = useState<RatingFilter>("all");
  const [minDiscount, setMinDiscount] = useState<DiscountFilter>("all");
  const [trustFilter, setTrustFilter] = useState<TrustFilter>("all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("popularity");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Compare (max 4) & Shortlist state
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [shortlistIds, setShortlistIds] = useState<string[]>([]);
  const [compareNotice, setCompareNotice] = useState<string | null>(null);

  // Modal & Link Analyzer focus trigger
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [analyzerFocusTrigger, setAnalyzerFocusTrigger] = useState(0);

  const lastSyncedSignatureRef = useRef<string>("");

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/catalog-snapshot", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.items)) {
        setCatalogItems(data.items);
      }
    } catch {
      // Keep existing state if fetch fails transiently
    } finally {
      setLoading(false);
    }
  }, []);

  // Bootstrap saved theme, guest lists, and authenticated session on mount
  useEffect(() => {
    let cancelled = false;

    let storedToken: string | null = null;
    try {
      const savedTheme = window.localStorage.getItem("rl_theme");
      if (savedTheme === "dark") {
        setIsDarkMode(true);
        document.documentElement.classList.add("dark");
      } else {
        setIsDarkMode(false);
        document.documentElement.classList.remove("dark");
      }

      const savedShortlist = window.localStorage.getItem("rl_shortlist_ids");
      const savedCompare = window.localStorage.getItem("rl_compare_ids");
      if (savedShortlist) {
        const parsed = JSON.parse(savedShortlist);
        if (Array.isArray(parsed)) setShortlistIds(parsed.slice(0, 50));
      }
      if (savedCompare) {
        const parsed = JSON.parse(savedCompare);
        if (Array.isArray(parsed)) setCompareIds(parsed.slice(0, 4));
      }

      storedToken = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (storedToken) setSessionToken(storedToken);
    } catch {
      // Ignore storage access errors in restricted iframes
    }

    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (storedToken) {
          headers.Authorization = `Bearer ${storedToken}`;
        }
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
          headers,
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setSupabaseConfigured(Boolean(data?.supabaseConfigured));
        }
        if (!cancelled && data?.authenticated && data?.user) {
          const user = data.user as AuthenticatedSessionUser;
          const nextShortlist = Array.isArray(user.shortlistIds) ? user.shortlistIds.slice(0, 50) : [];
          const nextCompare = Array.isArray(user.compareIds) ? user.compareIds.slice(0, 4) : [];
          lastSyncedSignatureRef.current = `${user.id}|${nextShortlist.join(",")}|${nextCompare.join(",")}`;
          setShortlistIds(nextShortlist);
          setCompareIds(nextCompare);
          setAuthUser(user);
          try {
            window.localStorage.setItem("rl_shortlist_ids", JSON.stringify(nextShortlist));
            window.localStorage.setItem("rl_compare_ids", JSON.stringify(nextCompare));
          } catch {}
        }
      } catch {
        // Treat transient network error on bootstrap as signed out
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const authUserId = authUser?.id ?? "";

  useEffect(() => {
    if (!authUserId) return;
    loadCatalog();
  }, [authUserId, loadCatalog]);

  const shortlistKey = shortlistIds.join(",");
  const compareKey = compareIds.join(",");

  // Debounced server sync whenever shortlistIds or compareIds change while signed in
  useEffect(() => {
    if (!authUserId) return;
    const nextSignature = `${authUserId}|${shortlistKey}|${compareKey}`;
    if (lastSyncedSignatureRef.current === nextSignature) return;

    const timer = window.setTimeout(async () => {
      const nextShortlist = shortlistKey ? shortlistKey.split(",") : [];
      const nextCompare = compareKey ? compareKey.split(",") : [];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      try {
        const res = await fetch("/api/user/sync", {
          method: "PUT",
          credentials: "include",
          headers,
          body: JSON.stringify({
            shortlistIds: nextShortlist,
            compareIds: nextCompare,
          }),
        });
        if (res.ok) {
          lastSyncedSignatureRef.current = nextSignature;
        }
      } catch {
        // Keep local optimistic state; next change will retry sync
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [authUserId, shortlistKey, compareKey, sessionToken]);

  const authProvider = authUser?.authProvider ?? "demo_local";

  // Live Supabase Realtime subscription on public.user_favorites across tabs/devices
  useEffect(() => {
    if (!authUserId || authProvider !== "supabase") return;
    const browserClient = createBrowserSupabaseClient();
    if (!browserClient) return;

    const channel = browserClient
      .channel(`rl-favorites-${authUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_favorites",
          filter: `user_id=eq.${authUserId}`,
        },
        async () => {
          const headers: Record<string, string> = {};
          if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
          try {
            const res = await fetch("/api/user/sync", {
              cache: "no-store",
              credentials: "include",
              headers,
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.ok) {
              const nextShortlist = Array.isArray(data.shortlistIds)
                ? data.shortlistIds.slice(0, 50)
                : [];
              const nextCompare = Array.isArray(data.compareIds)
                ? data.compareIds.slice(0, 4)
                : [];
              lastSyncedSignatureRef.current = `${authUserId}|${nextShortlist.join(",")}|${nextCompare.join(",")}`;
              setShortlistIds(nextShortlist);
              setCompareIds(nextCompare);
            }
          } catch {}
        },
      )
      .subscribe();

    return () => {
      browserClient.removeChannel(channel);
    };
  }, [authUserId, authProvider, sessionToken]);

  const handleAuthenticated = useCallback(
    (user: AuthenticatedSessionUser, token: string | null, isSbConfigured?: boolean) => {
      const nextShortlist = Array.isArray(user.shortlistIds) ? user.shortlistIds.slice(0, 50) : [];
      const nextCompare = Array.isArray(user.compareIds) ? user.compareIds.slice(0, 4) : [];
      lastSyncedSignatureRef.current = `${user.id}|${nextShortlist.join(",")}|${nextCompare.join(",")}`;
      setShortlistIds(nextShortlist);
      setCompareIds(nextCompare);
      setSessionToken(token);
      if (typeof isSbConfigured === "boolean") {
        setSupabaseConfigured(isSbConfigured);
      }
      setAuthUser(user);
      setActiveSection("catalog");
      try {
        if (token) {
          window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
        }
        window.localStorage.setItem("rl_shortlist_ids", JSON.stringify(nextShortlist));
        window.localStorage.setItem("rl_compare_ids", JSON.stringify(nextCompare));
      } catch {}
    },
    [],
  );

  const handleUpdateProfilePreferences = useCallback(
    async (prefs: {
      displayName?: string;
      mutedCategories?: string[];
      strictTrustMode?: boolean;
    }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      try {
        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify(prefs),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data?.user) {
          setAuthUser((prev) =>
            prev
              ? {
                  ...prev,
                  displayName: data.user.displayName,
                  mutedCategories: data.user.mutedCategories,
                  strictTrustMode: data.user.strictTrustMode,
                }
              : (data.user as AuthenticatedSessionUser),
          );
        }
      } catch {}
    },
    [sessionToken],
  );

  const handleSignOut = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers,
      });
    } catch {
      // Clear local session regardless of network response
    }
    lastSyncedSignatureRef.current = "";
    setAuthUser(null);
    setSessionToken(null);
    setSelectedProduct(null);
    setCompareNotice(null);
    setShortlistIds([]);
    setCompareIds([]);
    try {
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem("rl_shortlist_ids");
      window.localStorage.removeItem("rl_compare_ids");
    } catch {}
  }, [sessionToken]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        window.localStorage.setItem("rl_theme", next ? "dark" : "light");
      } catch {}
      return next;
    });
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter((item) => item !== id);
        setCompareNotice(null);
      } else {
        if (prev.length >= 4) {
          setCompareNotice("You can compare up to 4 products side by side.");
          return prev;
        }
        next = [...prev, id];
        setCompareNotice(null);
      }
      try {
        window.localStorage.setItem("rl_compare_ids", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    setCompareNotice(null);
    try {
      window.localStorage.removeItem("rl_compare_ids");
    } catch {}
  }, []);

  const toggleShortlist = useCallback((id: string) => {
    setShortlistIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id].slice(0, 50);
      try {
        window.localStorage.setItem("rl_shortlist_ids", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );
  }, []);

  const resetAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
    setPriceBracket("all");
    setMinRating("all");
    setMinDiscount("all");
    setTrustFilter("all");
    setSelectedBrands([]);
    setSortBy("popularity");
  }, []);

  const selectProductById = useCallback(
    (productId: string) => {
      const found = catalogItems.find((c) => c.product.id === productId);
      if (found) setSelectedProduct(found.product);
    },
    [catalogItems],
  );

  // Category counts across full 30-item catalog
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { product } of catalogItems) {
      const cat = product.category ?? "Other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [catalogItems]);

  const orderedCategories = useMemo(() => {
    const known = CATEGORIES_ORDER.filter((c) => (categoryCounts[c] ?? 0) > 0);
    const extras = Object.keys(categoryCounts).filter((c) => !CATEGORIES_ORDER.includes(c));
    return [...known, ...extras];
  }, [categoryCounts]);

  // Available brands scoped to selected category
  const availableBrands = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { product } of catalogItems) {
      if (selectedCategory !== "all" && product.category !== selectedCategory) continue;
      if (product.brand) {
        counts[product.brand] = (counts[product.brand] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [catalogItems, selectedCategory]);

  const mutedCategoriesKey = (authUser?.mutedCategories ?? []).join(",");
  const strictTrustMode = Boolean(authUser?.strictTrustMode);

  // Live relational Buyer Profile derived from shortlistIds + compareIds
  const buyerProfile = useMemo(
    () =>
      computeBuyerProfile(catalogItems, {
        shortlistIds,
        compareIds,
        mutedCategories: mutedCategoriesKey ? mutedCategoriesKey.split(",") : [],
        strictTrustMode,
        favoriteTimestamps: authUser?.favoriteTimestamps,
      }),
    [catalogItems, shortlistIds, compareIds, mutedCategoriesKey, strictTrustMode, authUser?.favoriteTimestamps],
  );

  const forYouScoreMap = useMemo(
    () =>
      computeForYouCatalogScores(catalogItems, {
        shortlistIds,
        compareIds,
        mutedCategories: mutedCategoriesKey ? mutedCategoriesKey.split(",") : [],
        strictTrustMode,
      }),
    [catalogItems, shortlistIds, compareIds, mutedCategoriesKey, strictTrustMode],
  );

  // Filtered + Sorted Catalog Items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matches = catalogItems.filter(({ product, snapshot }) => {
      if (selectedCategory !== "all" && product.category !== selectedCategory) {
        return false;
      }

      if (q) {
        const specText = Object.entries(product.specs ?? {})
          .map(([k, v]) => `${k} ${v}`)
          .join(" ")
          .toLowerCase();
        const haystack = [
          product.productName,
          product.brand,
          product.model,
          product.externalId,
          product.category,
          product.deviceType,
          product.description,
          specText,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      const price = product.price ?? 0;
      if (priceBracket === "under_2500" && price >= 2500) return false;
      if (priceBracket === "2500_10000" && (price < 2500 || price > 10000)) return false;
      if (priceBracket === "10000_35000" && (price < 10000 || price > 35000)) return false;
      if (priceBracket === "over_35000" && price <= 35000) return false;

      const rating = product.rating ?? 0;
      if (minRating === "4.0" && rating < 4.0) return false;
      if (minRating === "4.5" && rating < 4.5) return false;

      const discount = product.discountPercent ?? 0;
      if (minDiscount === "15" && discount < 15) return false;
      if (minDiscount === "30" && discount < 30) return false;
      if (minDiscount === "50" && discount < 50) return false;

      const avgRisk = snapshot?.details?.averageRisk ?? 0.14;
      if (trustFilter === "genuine_90" && avgRisk > 0.1) return false;
      if (trustFilter === "genuine_80" && avgRisk > 0.2) return false;
      if (trustFilter === "flagged" && avgRisk < 0.25) return false;

      if (selectedBrands.length > 0) {
        if (!product.brand || !selectedBrands.includes(product.brand)) return false;
      }

      return true;
    });

    return [...matches].sort((a, b) => {
      const pA = a.product;
      const pB = b.product;
      const riskA = a.snapshot?.details?.averageRisk ?? 0.14;
      const riskB = b.snapshot?.details?.averageRisk ?? 0.14;

      switch (sortBy) {
        case "for_you": {
          const scoreA = forYouScoreMap.get(pA.id) ?? 0;
          const scoreB = forYouScoreMap.get(pB.id) ?? 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return riskA - riskB;
        }
        case "price_asc":
          return (pA.price ?? Number.MAX_SAFE_INTEGER) - (pB.price ?? Number.MAX_SAFE_INTEGER);
        case "price_desc":
          return (pB.price ?? 0) - (pA.price ?? 0);
        case "rating_desc":
          return (
            (pB.rating ?? 0) - (pA.rating ?? 0) ||
            (pB.reviewCount ?? 0) - (pA.reviewCount ?? 0)
          );
        case "discount_desc":
          return (pB.discountPercent ?? 0) - (pA.discountPercent ?? 0);
        case "trust_desc":
          return riskA - riskB;
        case "risk_desc":
          return riskB - riskA;
        case "popularity":
        default:
          return (pB.reviewCount ?? 0) - (pA.reviewCount ?? 0);
      }
    });
  }, [
    catalogItems,
    searchQuery,
    selectedCategory,
    priceBracket,
    minRating,
    minDiscount,
    trustFilter,
    selectedBrands,
    sortBy,
    forYouScoreMap,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== "all") count++;
    if (priceBracket !== "all") count++;
    if (minRating !== "all") count++;
    if (minDiscount !== "all") count++;
    if (trustFilter !== "all") count++;
    if (selectedBrands.length > 0) count += selectedBrands.length;
    if (searchQuery.trim()) count++;
    return count;
  }, [
    selectedCategory,
    priceBracket,
    minRating,
    minDiscount,
    trustFilter,
    selectedBrands,
    searchQuery,
  ]);

  const comparedItems = useMemo(
    () =>
      compareIds
        .map((id) => catalogItems.find((item) => item.product.id === id))
        .filter((item): item is CatalogItem => Boolean(item)),
    [compareIds, catalogItems],
  );

  const shortlistedItems = useMemo(
    () => catalogItems.filter((item) => shortlistIds.includes(item.product.id)),
    [shortlistIds, catalogItems],
  );

  const selectedCatalogEntry = useMemo(
    () =>
      selectedProduct
        ? catalogItems.find((item) => item.product.id === selectedProduct.id) ?? null
        : null,
    [selectedProduct, catalogItems],
  );

  if (authChecking) {
    return (
      <div className={isDarkMode ? "dark" : ""}>
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-slate-950 px-4">
          <div className="w-full max-w-[1200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 animate-pulse">
            <div className="lg:col-span-7 space-y-4">
              <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-9 w-4/5 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-52 w-full bg-slate-100 dark:bg-slate-800 rounded-xl mt-6" />
            </div>
            <div className="lg:col-span-5 space-y-4 flex flex-col justify-center">
              <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />
              <div className="h-11 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />
              <div className="h-11 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />
              <div className="h-11 w-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <LoginScreen
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        supabaseConfigured={supabaseConfigured}
        guestShortlistIds={shortlistIds}
        guestCompareIds={compareIds}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors duration-150">
        {/* Top Bar with Theme Toggle & Session Sign Out */}
        <Header
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          compareCount={compareIds.length}
          shortlistCount={shortlistIds.length}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          onOpenAnalyzer={() => {
            setActiveSection("analyzer");
            setAnalyzerFocusTrigger((n) => n + 1);
          }}
          username={authUser.username}
          onSignOut={handleSignOut}
        />

        {/* Mobile Section Switcher (visible below md) */}
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto tabular-nums">
          {(
            [
              { id: "catalog", label: `Catalog (${catalogItems.length || 30})` },
              { id: "analyzer", label: "Link Analyzer" },
              { id: "profile", label: "Buyer Profile" },
              { id: "shortlist", label: `Shortlist (${shortlistIds.length})` },
              { id: "compare", label: `Compare (${compareIds.length})` },
            ] as { id: ActiveSection; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === tab.id
                  ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content Container */}
        <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 pb-28">
          {activeSection === "catalog" && (
            <div className="space-y-6">
              {/* Compact Split Storefront Hero + Marketplace Omni-Search */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
                  <p className="text-xs font-semibold tracking-wide text-amber-700 dark:text-amber-400 mb-2 tabular-nums">
                    Verified Indian Marketplace Directory · {catalogItems.length || 30} Products · 180 Audited Reviews
                  </p>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight mb-3">
                    Shop like Amazon & Flipkart — backed by review authenticity intelligence.
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mb-5">
                    Browse 30 real smartphones, laptops, audio gear, wearables, and home appliances sold in India with verified local product photography, live customer reviews, shill-ring graph forensics, and Google Search claim verification.
                  </p>

                  {/* Marketplace Search Input */}
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search 30 real products, brands, ASINs, or specs (e.g. iPhone 15, OLED, ANC, Air Fryer)..."
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl pl-10 pr-9 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          aria-label="Clear search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById("catalog-listing-anchor");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Explore All {catalogItems.length || 30} Items
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 relative min-h-[200px] sm:min-h-[240px] lg:min-h-full bg-zinc-100 dark:bg-slate-800 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800">
                  <Image
                    src={heroShowcaseImg}
                    alt="Flagship electronics and consumer hardware showcase"
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 42vw"
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4 text-xs text-white flex items-center justify-between tabular-nums">
                    <span>10 Departments · 20 Verified Brands</span>
                    <span className="font-mono text-amber-300">INR ₹ Pricing</span>
                  </div>
                </div>
              </section>

              {/* Department / Category Bar */}
              <div
                id="catalog-listing-anchor"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 flex items-center gap-1.5 overflow-x-auto"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("all");
                    setSelectedBrands([]);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                    selectedCategory === "all"
                      ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  All Departments ({catalogItems.length || 30})
                </button>
                {orderedCategories.map((cat) => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedBrands([]);
                      }}
                      className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                        active
                          ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {cat} ({categoryCounts[cat] ?? 0})
                    </button>
                  );
                })}
              </div>

              {/* 2-Column Storefront Workspace */}
              <div className="flex flex-col lg:flex-row items-start gap-6">
                {/* Mobile Filter Drawer Toggle */}
                <div className="w-full lg:hidden flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((v) => !v)}
                    className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-2 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    {mobileFiltersOpen ? "Hide Storefront Filters" : "Show Storefront Filters"}
                    {activeFilterCount > 0 && ` (${activeFilterCount} active)`}
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Left Faceted Sidebar */}
                <aside
                  className={`w-full lg:w-64 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-6 ${
                    mobileFiltersOpen ? "block" : "hidden lg:block"
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">Filters</h2>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset ({activeFilterCount})
                      </button>
                    )}
                  </div>

                  {/* Price Filter */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Price (INR)
                    </h3>
                    <div className="space-y-1 text-xs">
                      {(
                        [
                          { id: "all", label: "Any Price" },
                          { id: "under_2500", label: "Under ₹2,500" },
                          { id: "2500_10000", label: "₹2,500 – ₹10,000" },
                          { id: "10000_35000", label: "₹10,000 – ₹35,000" },
                          { id: "over_35000", label: "Over ₹35,000" },
                        ] as { id: PriceBracket; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPriceBracket(opt.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                            priceBracket === opt.id
                              ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customer Ratings Filter */}
                  <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Customer Ratings
                    </h3>
                    <div className="space-y-1 text-xs">
                      {(
                        [
                          { id: "all", label: "All Customer Ratings" },
                          { id: "4.5", label: "4.5★ & above" },
                          { id: "4.0", label: "4.0★ & above" },
                        ] as { id: RatingFilter; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMinRating(opt.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                            minRating === opt.id
                              ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {opt.id !== "all" && (
                            <Star
                              className={`w-3.5 h-3.5 shrink-0 ${
                                minRating === opt.id
                                  ? "fill-amber-400 text-amber-400 dark:fill-slate-950 dark:text-slate-950"
                                  : "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
                              }`}
                            />
                          )}
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ReviewLens Authenticity Filter */}
                  <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Review Authenticity
                    </h3>
                    <div className="space-y-1 text-xs">
                      {(
                        [
                          { id: "all", label: "All Products" },
                          { id: "genuine_90", label: "90%+ Genuine Pattern" },
                          { id: "genuine_80", label: "80%+ Genuine Pattern" },
                          { id: "flagged", label: "Suspicion Watch (≥25% risk)" },
                        ] as { id: TrustFilter; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTrustFilter(opt.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                            trustFilter === opt.id
                              ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Discount Filter */}
                  <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Discount
                    </h3>
                    <div className="space-y-1 text-xs">
                      {(
                        [
                          { id: "all", label: "Any Discount" },
                          { id: "15", label: "15% Off or more" },
                          { id: "30", label: "30% Off or more" },
                          { id: "50", label: "50% Off or more" },
                        ] as { id: DiscountFilter; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMinDiscount(opt.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                            minDiscount === opt.id
                              ? "bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Brand Multi-Select */}
                  <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Brands ({availableBrands.length})
                      </h3>
                      {selectedBrands.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedBrands([])}
                          className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-56 overflow-y-auto pr-1 space-y-1 text-xs">
                      {availableBrands.map(([brandName, count]) => {
                        const checked = selectedBrands.includes(brandName);
                        return (
                          <button
                            key={brandName}
                            type="button"
                            onClick={() => toggleBrand(brandName)}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer tabular-nums"
                          >
                            <span className="inline-flex items-center gap-2 text-slate-800 dark:text-slate-200 truncate">
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                              )}
                              <span className={checked ? "font-semibold text-slate-900 dark:text-white" : ""}>
                                {brandName}
                              </span>
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 text-[11px] ml-2">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </aside>

                {/* Right Product Listing Workspace */}
                <div className="flex-1 min-w-0 w-full space-y-4">
                  {/* Personalised Buyer Profile Strip */}
                  {buyerProfile.hasSignals && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 tabular-nums">
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        <strong className="font-semibold text-slate-900 dark:text-white">
                          {buyerProfile.personaTitle}
                        </strong>
                        {" · "}
                        {buyerProfile.categoryAffinities
                          .filter((c) => !c.muted)
                          .slice(0, 2)
                          .map((c) => `${c.category} (${c.sharePercent}%)`)
                          .join(" · ")}
                        {buyerProfile.trust && ` · ${buyerProfile.trust.avgGenuinePercent}% avg genuine`}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {sortBy !== "for_you" && (
                          <button
                            type="button"
                            onClick={() => setSortBy("for_you")}
                            className="font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap cursor-pointer"
                          >
                            Sort For You
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveSection("profile")}
                          className="font-semibold text-slate-800 dark:text-slate-100 hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                        >
                          <span>Buyer Profile</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sort & View Mode Utility Bar */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      Showing{" "}
                      <strong className="font-bold text-slate-900 dark:text-white">
                        {filteredItems.length}
                      </strong>{" "}
                      of{" "}
                      <strong className="font-bold text-slate-900 dark:text-white">
                        {catalogItems.length}
                      </strong>{" "}
                      verified products
                      {selectedCategory !== "all" && (
                        <span>
                          {" "}
                          in <strong className="text-slate-900 dark:text-white">{selectedCategory}</strong>
                        </span>
                      )}
                      {searchQuery.trim() && (
                        <span>
                          {" "}
                          matching{" "}
                          <strong className="text-slate-900 dark:text-white">
                            &ldquo;{searchQuery.trim()}&rdquo;
                          </strong>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <label
                          htmlFor="storefront-sort"
                          className="text-slate-500 dark:text-slate-400 whitespace-nowrap"
                        >
                          Sort by:
                        </label>
                        <select
                          id="storefront-sort"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortOption)}
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400 cursor-pointer"
                        >
                          <option value="for_you">For You (Buyer Profile Match)</option>
                          <option value="popularity">Popularity (Most Reviewed)</option>
                          <option value="price_asc">Price: Low to High</option>
                          <option value="price_desc">Price: High to Low</option>
                          <option value="rating_desc">Customer Rating</option>
                          <option value="discount_desc">Biggest Discount</option>
                          <option value="trust_desc">Highest Review Authenticity</option>
                          <option value="risk_desc">Highest Suspicion Risk</option>
                        </select>
                      </div>

                      <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setViewMode("grid")}
                          aria-label="Grid view"
                          title="Amazon-style Grid View"
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            viewMode === "grid"
                              ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-amber-400 shadow-xs"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                          }`}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("list")}
                          aria-label="List view"
                          title="Flipkart-style Spec List View"
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            viewMode === "list"
                              ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-amber-400 shadow-xs"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                          }`}
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {compareNotice && (
                    <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between">
                      <span>{compareNotice}</span>
                      <button
                        type="button"
                        onClick={() => setCompareNotice(null)}
                        className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white font-semibold cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Product Results */}
                  {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {[...Array(9)].map((_, idx) => (
                        <div
                          key={idx}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl h-96 animate-pulse p-4 flex flex-col justify-between"
                        >
                          <div className="h-44 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                          <div className="space-y-2">
                            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-5/6" />
                            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
                          </div>
                          <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                        No matching products found
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mb-5 max-w-md mx-auto">
                        Try broadening your price range, clearing brand checkboxes, or searching a different model keyword.
                      </p>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredItems.map(({ product, snapshot, reviews }) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          snapshot={snapshot}
                          reviewCountLoaded={reviews?.length}
                          viewMode="grid"
                          isCompared={compareIds.includes(product.id)}
                          isShortlisted={shortlistIds.includes(product.id)}
                          onSelect={setSelectedProduct}
                          onToggleCompare={toggleCompare}
                          onToggleShortlist={toggleShortlist}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredItems.map(({ product, snapshot, reviews }) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          snapshot={snapshot}
                          reviewCountLoaded={reviews?.length}
                          viewMode="list"
                          isCompared={compareIds.includes(product.id)}
                          isShortlisted={shortlistIds.includes(product.id)}
                          onSelect={setSelectedProduct}
                          onToggleCompare={toggleCompare}
                          onToggleShortlist={toggleShortlist}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Side-by-Side Comparison View */}
          {activeSection === "compare" && (
            <CompareSection
              items={comparedItems}
              onRemove={toggleCompare}
              onClear={clearCompare}
              onSelectProduct={setSelectedProduct}
              onBrowseCatalog={() => setActiveSection("catalog")}
            />
          )}

          {/* Product Link Analyzer & Reliability Inspector */}
          {activeSection === "analyzer" && (
            <LinkAnalyzerSection
              sessionToken={sessionToken}
              shortlistIds={shortlistIds}
              compareIds={compareIds}
              focusTrigger={analyzerFocusTrigger}
              onToggleShortlist={toggleShortlist}
              onToggleCompare={toggleCompare}
              onSelectProductById={selectProductById}
              onProductSavedToCatalog={async () => {
                await loadCatalog();
              }}
            />
          )}

          {/* Favourites-Driven Buyer Profile & Saved Shortlist Workspace */}
          {(activeSection === "shortlist" || activeSection === "profile") && (
            <BuyerProfileSection
              key={activeSection}
              user={authUser}
              supabaseConfigured={supabaseConfigured}
              initialSubTab={activeSection === "shortlist" ? "shortlist" : "taste"}
              buyerProfile={buyerProfile}
              shortlistedItems={shortlistedItems}
              compareIds={compareIds}
              shortlistIds={shortlistIds}
              onSelectProduct={setSelectedProduct}
              onSelectProductById={selectProductById}
              onToggleCompare={toggleCompare}
              onToggleShortlist={toggleShortlist}
              onClearShortlist={() => {
                setShortlistIds([]);
                try {
                  window.localStorage.removeItem("rl_shortlist_ids");
                } catch {}
              }}
              onApplyForYouSort={() => {
                resetAllFilters();
                setSortBy("for_you");
                setActiveSection("catalog");
              }}
              onBrowseCategory={(cat) => {
                setSelectedCategory(cat);
                setSelectedBrands([]);
                setActiveSection("catalog");
              }}
              onBrowseBrand={(brand) => {
                setSelectedCategory("all");
                setSelectedBrands([brand]);
                setActiveSection("catalog");
              }}
              onBrowseCatalog={() => setActiveSection("catalog")}
              onUpdatePreferences={handleUpdateProfilePreferences}
            />
          )}
        </main>

        {/* Sticky Bottom Compare Tray */}
        <AnimatePresence>
          {compareIds.length > 0 && activeSection !== "compare" && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed bottom-0 inset-x-0 z-30 bg-slate-900 dark:bg-slate-900 text-white border-t border-slate-800 dark:border-slate-700 shadow-2xl"
            >
              <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto max-w-full sm:max-w-[70%]">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 shrink-0 mr-1">
                    <Scale className="w-4 h-4" />
                    Compare ({comparedItems.length}/4):
                  </span>
                  {comparedItems.map(({ product }) => (
                    <div
                      key={product.id}
                      className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 shrink-0 max-w-[200px]"
                    >
                      <span className="truncate">{product.model ?? product.productName}</span>
                      <button
                        type="button"
                        onClick={() => toggleCompare(product.id)}
                        aria-label={`Remove ${product.productName} from comparison`}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={clearCompare}
                    className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection("compare")}
                    className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Compare Now ({comparedItems.length})
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Product Detail & Segregated Reviews Modal (Instant 0ms Preloaded Reviews) */}
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            initialReviews={selectedCatalogEntry?.reviews}
            initialReviewAnalyses={selectedCatalogEntry?.reviewAnalyses}
            initialSummary={selectedCatalogEntry?.snapshot}
            isCompared={compareIds.includes(selectedProduct.id)}
            isShortlisted={shortlistIds.includes(selectedProduct.id)}
            onToggleCompare={toggleCompare}
            onToggleShortlist={toggleShortlist}
            onClose={() => setSelectedProduct(null)}
            onRefreshCatalog={loadCatalog}
          />
        )}
      </div>
    </div>
  );
}
