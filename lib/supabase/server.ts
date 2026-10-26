import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { normalizeUsername } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { MAX_COMPARE_ITEMS, MAX_SHORTLIST_ITEMS, sanitizeIdList } from "@/lib/userStore";
import { getSupabasePublicEnv } from "./config";

export interface RelationalSupabaseUserPayload {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  authProvider: "supabase";
  shortlistIds: string[];
  compareIds: string[];
  mutedCategories: string[];
  strictTrustMode: boolean;
  favoriteTimestamps: Record<string, string>;
  updatedAt: string;
}

export function isSupabaseAuthConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}

function isHttpsFromRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === "production";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]!.trim().toLowerCase() === "https";
  }
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

/**
 * Creates a @supabase/ssr server client bound to Next.js cookies().
 * Applies SameSite=None; Secure on HTTPS so sessions persist cleanly inside preview iframes.
 */
export function createServerSupabaseClient(req?: Request): SupabaseClient | null {
  const pub = getSupabasePublicEnv();
  if (!pub) return null;

  const cookieStore = cookies();
  const isHttps = isHttpsFromRequest(req);

  return createServerClient(pub.url, pub.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...options,
              sameSite: isHttps ? "none" : (options?.sameSite ?? "lax"),
              secure: isHttps ? true : options?.secure,
            });
          }
        } catch {
          // Server Components cannot mutate cookies directly; Route Handlers and Middleware can.
        }
      },
    },
  });
}

/**
 * Creates a request-scoped Supabase client authenticated with a Bearer access token
 * (used when third-party cookies are blocked by strict browser iframe settings).
 */
export function createBearerSupabaseClient(accessToken: string): SupabaseClient | null {
  const pub = getSupabasePublicEnv();
  if (!pub || !accessToken) return null;
  return createClient(pub.url, pub.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Optional service-role client for server-only username->email lookups when SUPABASE_SERVICE_ROLE_KEY is set.
 */
export function createServiceSupabaseClient(): SupabaseClient | null {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey) return null;
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function deriveSafeUsername(authUser: User): string {
  const metaUsername =
    typeof authUser.user_metadata?.username === "string"
      ? authUser.user_metadata.username
      : "";
  const emailPrefix = authUser.email ? authUser.email.split("@")[0] ?? "" : "";
  const cleaned = normalizeUsername(metaUsername || emailPrefix).replace(/[^a-z0-9_]/g, "");
  if (cleaned.length >= 3) {
    return cleaned.slice(0, 24);
  }
  return `buyer_${authUser.id.replace(/-/g, "").slice(0, 6)}`;
}

/**
 * Resolves the authenticated Supabase user (via SSR cookies or Bearer JWT)
 * and loads their relational `profiles` + `user_favorites` records.
 */
export async function resolveSupabaseUserWithClient(
  req: Request,
): Promise<{ client: SupabaseClient; authUser: User } | null> {
  if (!isSupabaseAuthConfigured()) return null;

  // 1. Check explicit Bearer token header first for iframe resilience
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    // Supabase JWTs have 3 dot-separated segments (whereas local HMAC tokens have 2)
    if (bearer && bearer.split(".").length === 3) {
      const bearerClient = createBearerSupabaseClient(bearer);
      if (bearerClient) {
        const { data, error } = await bearerClient.auth.getUser(bearer);
        if (!error && data.user) {
          return { client: bearerClient, authUser: data.user };
        }
      }
    }
  }

  // 2. Check @supabase/ssr cookies
  const ssrClient = createServerSupabaseClient(req);
  if (!ssrClient) return null;
  const { data, error } = await ssrClient.auth.getUser();
  if (error || !data.user) return null;
  return { client: ssrClient, authUser: data.user };
}

/**
 * Hydrates a RelationalSupabaseUserPayload from `public.profiles` and `public.user_favorites`.
 * Gracefully auto-creates the profile row if missing, and falls back to user_metadata if SQL migration hasn't run yet.
 */
export async function loadRelationalSupabaseProfile(
  client: SupabaseClient,
  authUser: User,
): Promise<RelationalSupabaseUserPayload> {
  const fallbackUsername = deriveSafeUsername(authUser);
  const fallbackDisplayName =
    (typeof authUser.user_metadata?.display_name === "string" &&
      authUser.user_metadata.display_name.trim()) ||
    (typeof authUser.user_metadata?.full_name === "string" &&
      authUser.user_metadata.full_name.trim()) ||
    fallbackUsername;

  let username = fallbackUsername;
  let displayName: string | null = fallbackDisplayName;
  let mutedCategories: string[] = [];
  let strictTrustMode = false;
  let updatedAt = authUser.updated_at ?? new Date().toISOString();

  // 1. Load or initialize `public.profiles`
  try {
    const { data: profileRow, error: profileErr } = await client
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();

    if (!profileErr && profileRow) {
      if (typeof profileRow.username === "string" && profileRow.username) {
        username = profileRow.username;
      }
      if (typeof profileRow.display_name === "string" && profileRow.display_name.trim()) {
        displayName = profileRow.display_name.trim();
      }
      if (Array.isArray(profileRow.muted_categories)) {
        mutedCategories = sanitizeIdList(profileRow.muted_categories, 20);
      }
      if (typeof profileRow.strict_trust_mode === "boolean") {
        strictTrustMode = profileRow.strict_trust_mode;
      }
      if (typeof profileRow.updated_at === "string") {
        updatedAt = profileRow.updated_at;
      }
    } else if (!profileErr && !profileRow) {
      // Auto-provision profile row if trigger wasn't installed yet
      const candidate = `${fallbackUsername.slice(0, 18)}_${authUser.id.slice(0, 4)}`;
      const { data: inserted } = await client
        .from("profiles")
        .upsert(
          {
            id: authUser.id,
            username: fallbackUsername,
            email: authUser.email ?? null,
            display_name: fallbackDisplayName,
          },
          { onConflict: "id" },
        )
        .select("*")
        .maybeSingle();

      if (inserted && typeof inserted.username === "string") {
        username = inserted.username;
      } else {
        // Retry with collision-safe suffix if username was taken
        const { data: retryInserted } = await client
          .from("profiles")
          .upsert(
            {
              id: authUser.id,
              username: candidate,
              email: authUser.email ?? null,
              display_name: fallbackDisplayName,
            },
            { onConflict: "id" },
          )
          .select("*")
          .maybeSingle();
        if (retryInserted && typeof retryInserted.username === "string") {
          username = retryInserted.username;
        }
      }
    }
  } catch {
    // Gracefully fallback to user_metadata if `profiles` table is not migrated yet
  }

  // 2. Load relational `public.user_favorites` rows
  const shortlistIds: string[] = [];
  const compareIds: string[] = [];
  const favoriteTimestamps: Record<string, string> = {};

  try {
    const { data: favRows, error: favErr } = await client
      .from("user_favorites")
      .select("product_id, interaction_type, created_at")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: true });

    if (!favErr && Array.isArray(favRows)) {
      for (const row of favRows) {
        const pid = typeof row.product_id === "string" ? row.product_id.trim() : "";
        if (!pid) continue;
        if (row.interaction_type === "shortlist" && shortlistIds.length < MAX_SHORTLIST_ITEMS) {
          if (!shortlistIds.includes(pid)) {
            shortlistIds.push(pid);
          }
          if (typeof row.created_at === "string") {
            favoriteTimestamps[pid] = row.created_at;
          }
        } else if (row.interaction_type === "compare" && compareIds.length < MAX_COMPARE_ITEMS) {
          if (!compareIds.includes(pid)) {
            compareIds.push(pid);
          }
        }
      }
    } else if (favErr) {
      // Fallback to metadata lists if `user_favorites` migration hasn't been executed yet
      const metaShortlist = sanitizeIdList(authUser.user_metadata?.shortlist_ids, MAX_SHORTLIST_ITEMS);
      const metaCompare = sanitizeIdList(authUser.user_metadata?.compare_ids, MAX_COMPARE_ITEMS);
      shortlistIds.push(...metaShortlist);
      compareIds.push(...metaCompare);
    }
  } catch {
    const metaShortlist = sanitizeIdList(authUser.user_metadata?.shortlist_ids, MAX_SHORTLIST_ITEMS);
    const metaCompare = sanitizeIdList(authUser.user_metadata?.compare_ids, MAX_COMPARE_ITEMS);
    shortlistIds.push(...metaShortlist);
    compareIds.push(...metaCompare);
  }

  return {
    id: authUser.id,
    username,
    email: authUser.email ?? null,
    displayName,
    authProvider: "supabase",
    shortlistIds,
    compareIds,
    mutedCategories,
    strictTrustMode,
    favoriteTimestamps,
    updatedAt,
  };
}

/**
 * Syncs `shortlistIds` and `compareIds` into `public.user_favorites` via RPC or row diffing.
 */
export async function syncRelationalSupabaseFavorites(
  client: SupabaseClient,
  authUser: User,
  lists: { shortlistIds?: unknown; compareIds?: unknown },
): Promise<RelationalSupabaseUserPayload> {
  const current = await loadRelationalSupabaseProfile(client, authUser);
  const nextShortlist =
    lists.shortlistIds !== undefined
      ? sanitizeIdList(lists.shortlistIds, MAX_SHORTLIST_ITEMS)
      : current.shortlistIds;
  const nextCompare =
    lists.compareIds !== undefined
      ? sanitizeIdList(lists.compareIds, MAX_COMPARE_ITEMS)
      : current.compareIds;

  let persistedRelationally = false;

  // Attempt atomic Postgres RPC first (defined in 0003_auth_profiles_favorites.sql)
  try {
    const { error: rpcError } = await client.rpc("sync_user_favorites", {
      p_shortlist_ids: nextShortlist,
      p_compare_ids: nextCompare,
    });
    if (!rpcError) {
      persistedRelationally = true;
    }
  } catch {
    persistedRelationally = false;
  }

  // Fallback to direct relational table queries if RPC wasn't created yet
  if (!persistedRelationally) {
    try {
      await client
        .from("user_favorites")
        .delete()
        .eq("user_id", authUser.id)
        .in("interaction_type", ["shortlist", "compare"]);

      const rowsToInsert = [
        ...nextShortlist.map((pid) => ({
          user_id: authUser.id,
          product_id: pid,
          interaction_type: "shortlist" as const,
        })),
        ...nextCompare.map((pid) => ({
          user_id: authUser.id,
          product_id: pid,
          interaction_type: "compare" as const,
        })),
      ];

      if (rowsToInsert.length > 0) {
        const { error: insertErr } = await client.from("user_favorites").insert(rowsToInsert);
        if (!insertErr) {
          persistedRelationally = true;
        }
      } else {
        persistedRelationally = true;
      }
    } catch {
      persistedRelationally = false;
    }
  }

  // If relational tables aren't created yet, mirror safely in auth user_metadata so nothing is lost
  if (!persistedRelationally) {
    try {
      await client.auth.updateUser({
        data: {
          shortlist_ids: nextShortlist,
          compare_ids: nextCompare,
        },
      });
    } catch {
      // Non-fatal
    }
  }

  return loadRelationalSupabaseProfile(client, authUser);
}

/**
 * Updates Buyer Profile preferences (`displayName`, `mutedCategories`, `strictTrustMode`) in `public.profiles`.
 */
export async function updateRelationalSupabaseProfilePrefs(
  client: SupabaseClient,
  authUser: User,
  prefs: {
    displayName?: unknown;
    mutedCategories?: unknown;
    strictTrustMode?: unknown;
  },
): Promise<RelationalSupabaseUserPayload> {
  const current = await loadRelationalSupabaseProfile(client, authUser);
  const nextDisplayName =
    typeof prefs.displayName === "string"
      ? prefs.displayName.trim().slice(0, 48) || current.username
      : current.displayName;
  const nextMuted =
    prefs.mutedCategories !== undefined
      ? sanitizeIdList(prefs.mutedCategories, 20)
      : current.mutedCategories;
  const nextStrict =
    typeof prefs.strictTrustMode === "boolean"
      ? prefs.strictTrustMode
      : current.strictTrustMode;

  try {
    await client.from("profiles").upsert(
      {
        id: authUser.id,
        username: current.username,
        email: authUser.email ?? null,
        display_name: nextDisplayName,
        muted_categories: nextMuted,
        strict_trust_mode: nextStrict,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch {
    // Also mirror in user_metadata if table isn't created yet
    try {
      await client.auth.updateUser({
        data: {
          display_name: nextDisplayName,
          muted_categories: nextMuted,
          strict_trust_mode: nextStrict,
        },
      });
    } catch {}
  }

  return loadRelationalSupabaseProfile(client, authUser);
}
