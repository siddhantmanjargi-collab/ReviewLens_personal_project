import { createHash, randomInt, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashPassword, normalizeEmail, normalizeUsername, verifyPassword } from "./auth";
import { getConfig } from "./config";

const USERS_STORE_PATH = "/tmp/reviewlens-users-store.json";

export const MAX_SHORTLIST_ITEMS = 50;
export const MAX_COMPARE_ITEMS = 4;

export interface StoredUserRecord {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  passwordHash: string;
  passwordSalt: string;
  shortlistIds: string[];
  compareIds: string[];
  mutedCategories: string[];
  strictTrustMode: boolean;
  favoriteTimestamps: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUserSession {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  authProvider: "supabase" | "demo_local";
  shortlistIds: string[];
  compareIds: string[];
  mutedCategories: string[];
  strictTrustMode: boolean;
  favoriteTimestamps: Record<string, string>;
  updatedAt: string;
}

interface PersistedUsersState {
  users: StoredUserRecord[];
}

interface PendingOtpEntry {
  email: string;
  code: string;
  expiresAt: number;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function sanitizeIdList(raw: unknown, maxLength: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 120 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= maxLength) break;
  }
  return out;
}

export function toPublicUser(user: StoredUserRecord): PublicUserSession {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName ?? user.username,
    authProvider: "demo_local",
    shortlistIds: user.shortlistIds,
    compareIds: user.compareIds,
    mutedCategories: user.mutedCategories ?? [],
    strictTrustMode: Boolean(user.strictTrustMode),
    favoriteTimestamps: user.favoriteTimestamps ?? {},
    updatedAt: user.updatedAt,
  };
}

class UserStore {
  private usersById = new Map<string, StoredUserRecord>();
  private userIdByUsername = new Map<string, string>();
  private userIdByEmail = new Map<string, string>();
  private pendingOtps = new Map<string, PendingOtpEntry>();
  private supabaseClient: SupabaseClient | null = null;
  private supabaseAvailable: boolean | null = null;

  constructor() {
    this.seedDemoUser();
    this.hydrateFromDisk();
    this.initSupabase();
  }

  private initSupabase() {
    const cfg = getConfig();
    if (cfg.supabaseUrl && cfg.supabaseServiceRoleKey) {
      try {
        this.supabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      } catch {
        this.supabaseClient = null;
      }
    }
  }

  private seedDemoUser() {
    const demoId = deterministicUuid("user:analyst");
    const demoSalt = createHash("sha256")
      .update("reviewlens-demo-salt:analyst")
      .digest("hex")
      .slice(0, 32);
    const { hashHex, saltHex } = hashPassword("reviewlens", demoSalt);
    const nowIso = "2026-10-25T06:00:00.000Z";

    const iphone15Id = deterministicUuid("product:B0CHX1W1XY");
    const s24UltraId = deterministicUuid("product:B0CS5XW6TN");
    const onePlus12RId = deterministicUuid("product:B0D7W9R1HM");

    const demoRecord: StoredUserRecord = {
      id: demoId,
      username: "analyst",
      email: "analyst@reviewlens.in",
      displayName: "Hardware Analyst",
      passwordHash: hashHex,
      passwordSalt: saltHex,
      shortlistIds: [iphone15Id, s24UltraId, onePlus12RId],
      compareIds: [iphone15Id, s24UltraId],
      mutedCategories: [],
      strictTrustMode: false,
      favoriteTimestamps: {
        [iphone15Id]: "2026-10-25T06:00:00.000Z",
        [s24UltraId]: "2026-10-25T06:05:00.000Z",
        [onePlus12RId]: "2026-10-25T06:10:00.000Z",
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.usersById.set(demoRecord.id, demoRecord);
    this.userIdByUsername.set(demoRecord.username, demoRecord.id);
    if (demoRecord.email) {
      this.userIdByEmail.set(demoRecord.email, demoRecord.id);
    }
  }

  private hydrateFromDisk() {
    try {
      if (!fs.existsSync(USERS_STORE_PATH)) return;
      const parsed = JSON.parse(
        fs.readFileSync(USERS_STORE_PATH, "utf8"),
      ) as Partial<PersistedUsersState>;
      for (const rec of parsed.users ?? []) {
        if (!rec || typeof rec.id !== "string" || typeof rec.username !== "string") continue;
        const normalized = normalizeUsername(rec.username);
        if (!normalized) continue;
        const normalizedMail =
          typeof rec.email === "string" && rec.email.trim() ? normalizeEmail(rec.email) : null;
        const clean: StoredUserRecord = {
          id: rec.id,
          username: normalized,
          email: normalizedMail,
          displayName:
            typeof rec.displayName === "string" && rec.displayName.trim()
              ? rec.displayName.trim()
              : normalized,
          passwordHash: rec.passwordHash,
          passwordSalt: rec.passwordSalt,
          shortlistIds: sanitizeIdList(rec.shortlistIds, MAX_SHORTLIST_ITEMS),
          compareIds: sanitizeIdList(rec.compareIds, MAX_COMPARE_ITEMS),
          mutedCategories: sanitizeIdList(rec.mutedCategories, 20),
          strictTrustMode: Boolean(rec.strictTrustMode),
          favoriteTimestamps:
            rec.favoriteTimestamps && typeof rec.favoriteTimestamps === "object"
              ? (rec.favoriteTimestamps as Record<string, string>)
              : {},
          createdAt: rec.createdAt || new Date().toISOString(),
          updatedAt: rec.updatedAt || new Date().toISOString(),
        };
        const existingId = this.userIdByUsername.get(normalized);
        if (existingId && existingId !== clean.id) {
          this.usersById.delete(existingId);
        }
        this.usersById.set(clean.id, clean);
        this.userIdByUsername.set(clean.username, clean.id);
        if (clean.email) {
          this.userIdByEmail.set(clean.email, clean.id);
        }
      }
    } catch {
      // Non-fatal if /tmp file is unreadable or absent
    }
  }

  private persistToDisk() {
    try {
      const payload: PersistedUsersState = {
        users: [...this.usersById.values()],
      };
      fs.writeFileSync(USERS_STORE_PATH, JSON.stringify(payload));
    } catch {
      // Non-fatal in read-only environments
    }
  }

  private putInMemory(record: StoredUserRecord) {
    const prevId = this.userIdByUsername.get(record.username);
    if (prevId && prevId !== record.id) {
      this.usersById.delete(prevId);
    }
    this.usersById.set(record.id, record);
    this.userIdByUsername.set(record.username, record.id);
    if (record.email) {
      this.userIdByEmail.set(record.email, record.id);
    }
    this.persistToDisk();
  }

  private rowToRecord(row: Record<string, unknown>): StoredUserRecord | null {
    if (
      typeof row.id !== "string" ||
      typeof row.username !== "string" ||
      typeof row.password_hash !== "string" ||
      typeof row.password_salt !== "string"
    ) {
      return null;
    }
    return {
      id: row.id,
      username: normalizeUsername(row.username),
      email: typeof row.email === "string" ? normalizeEmail(row.email) : null,
      displayName:
        typeof row.display_name === "string" ? row.display_name : normalizeUsername(row.username),
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      shortlistIds: sanitizeIdList(row.shortlist_ids, MAX_SHORTLIST_ITEMS),
      compareIds: sanitizeIdList(row.compare_ids, MAX_COMPARE_ITEMS),
      mutedCategories: sanitizeIdList(row.muted_categories, 20),
      strictTrustMode: Boolean(row.strict_trust_mode),
      favoriteTimestamps: {},
      createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    };
  }

  private async tryFetchSupabaseByUsername(username: string): Promise<StoredUserRecord | null> {
    if (!this.supabaseClient || this.supabaseAvailable === false) return null;
    try {
      const { data, error } = await this.supabaseClient
        .from("app_users")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) {
        this.supabaseAvailable = false;
        return null;
      }
      this.supabaseAvailable = true;
      if (!data) return null;
      const mapped = this.rowToRecord(data as Record<string, unknown>);
      if (mapped) this.putInMemory(mapped);
      return mapped;
    } catch {
      this.supabaseAvailable = false;
      return null;
    }
  }

  private async tryFetchSupabaseById(id: string): Promise<StoredUserRecord | null> {
    if (!this.supabaseClient || this.supabaseAvailable === false) return null;
    try {
      const { data, error } = await this.supabaseClient
        .from("app_users")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        this.supabaseAvailable = false;
        return null;
      }
      this.supabaseAvailable = true;
      if (!data) return null;
      const mapped = this.rowToRecord(data as Record<string, unknown>);
      if (mapped) this.putInMemory(mapped);
      return mapped;
    } catch {
      this.supabaseAvailable = false;
      return null;
    }
  }

  private async tryUpsertSupabase(record: StoredUserRecord): Promise<void> {
    if (!this.supabaseClient || this.supabaseAvailable === false) return;
    try {
      const { error } = await this.supabaseClient.from("app_users").upsert(
        {
          id: record.id,
          username: record.username,
          password_hash: record.passwordHash,
          password_salt: record.passwordSalt,
          shortlist_ids: record.shortlistIds,
          compare_ids: record.compareIds,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        },
        { onConflict: "username" },
      );
      if (error) {
        this.supabaseAvailable = false;
      } else {
        this.supabaseAvailable = true;
      }
    } catch {
      this.supabaseAvailable = false;
    }
  }

  async findByUsername(rawUsername: string): Promise<StoredUserRecord | null> {
    const username = normalizeUsername(rawUsername);
    if (!username) return null;
    const remote = await this.tryFetchSupabaseByUsername(username);
    if (remote) return remote;
    const id = this.userIdByUsername.get(username);
    return id ? this.usersById.get(id) ?? null : null;
  }

  async findByEmail(rawEmail: string): Promise<StoredUserRecord | null> {
    const email = normalizeEmail(rawEmail);
    if (!email) return null;
    const id = this.userIdByEmail.get(email);
    return id ? this.usersById.get(id) ?? null : null;
  }

  async findById(id: string): Promise<StoredUserRecord | null> {
    if (!id) return null;
    const remote = await this.tryFetchSupabaseById(id);
    if (remote) return remote;
    return this.usersById.get(id) ?? null;
  }

  async authenticateUser(
    rawIdentifier: string,
    password: string,
  ): Promise<PublicUserSession | null> {
    const trimmed = rawIdentifier.trim();
    const isEmail = trimmed.includes("@") && !trimmed.startsWith("@");
    const user = isEmail
      ? await this.findByEmail(trimmed)
      : await this.findByUsername(trimmed);
    if (!user) return null;
    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) return null;
    return toPublicUser(user);
  }

  async createUser(input: {
    email?: string | null;
    username: string;
    password: string;
    shortlistIds?: unknown;
    compareIds?: unknown;
  }): Promise<{ ok: true; user: PublicUserSession } | { ok: false; status: number; error: string }> {
    const username = normalizeUsername(input.username);
    const email = input.email ? normalizeEmail(input.email) : null;

    const existingUsername = await this.findByUsername(username);
    if (existingUsername) {
      return {
        ok: false,
        status: 409,
        error: `Username "@${username}" is already taken. Try signing in or pick another username.`,
      };
    }

    if (email) {
      const existingEmail = await this.findByEmail(email);
      if (existingEmail) {
        return {
          ok: false,
          status: 409,
          error: `An account with "${email}" already exists. Sign in or request a one-time code.`,
        };
      }
    }

    const { hashHex, saltHex } = hashPassword(input.password);
    const nowIso = new Date().toISOString();
    const shortlistIds = sanitizeIdList(input.shortlistIds, MAX_SHORTLIST_ITEMS);
    const favoriteTimestamps: Record<string, string> = {};
    for (const pid of shortlistIds) {
      favoriteTimestamps[pid] = nowIso;
    }

    const record: StoredUserRecord = {
      id: randomUUID(),
      username,
      email,
      displayName: username,
      passwordHash: hashHex,
      passwordSalt: saltHex,
      shortlistIds,
      compareIds: sanitizeIdList(input.compareIds, MAX_COMPARE_ITEMS),
      mutedCategories: [],
      strictTrustMode: false,
      favoriteTimestamps,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.putInMemory(record);
    await this.tryUpsertSupabase(record);
    return { ok: true, user: toPublicUser(record) };
  }

  issuePreviewOtp(rawEmail: string): { code: string; expiresInSeconds: number } {
    const email = normalizeEmail(rawEmail);
    const code = String(randomInt(100000, 999999));
    const expiresInSeconds = 600;
    this.pendingOtps.set(email, {
      email,
      code,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });
    return { code, expiresInSeconds };
  }

  async verifyPreviewOtp(
    rawEmail: string,
    rawCode: string,
    guestLists?: { shortlistIds?: unknown; compareIds?: unknown },
  ): Promise<PublicUserSession | null> {
    const email = normalizeEmail(rawEmail);
    const pending = this.pendingOtps.get(email);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pendingOtps.delete(email);
      return null;
    }
    if (pending.code !== rawCode.trim()) {
      return null;
    }
    this.pendingOtps.delete(email);

    let existing = await this.findByEmail(email);
    if (!existing) {
      const baseHandle =
        normalizeUsername(email.split("@")[0] ?? "buyer").replace(/[^a-z0-9_]/g, "") || "buyer";
      let candidate = baseHandle.length >= 3 ? baseHandle.slice(0, 20) : `buyer_${randomInt(100, 999)}`;
      if (await this.findByUsername(candidate)) {
        candidate = `${candidate.slice(0, 18)}_${randomInt(10, 99)}`;
      }
      const { hashHex, saltHex } = hashPassword(randomUUID());
      const nowIso = new Date().toISOString();
      const shortlistIds = sanitizeIdList(guestLists?.shortlistIds, MAX_SHORTLIST_ITEMS);
      const favoriteTimestamps: Record<string, string> = {};
      for (const pid of shortlistIds) favoriteTimestamps[pid] = nowIso;

      existing = {
        id: randomUUID(),
        username: candidate,
        email,
        displayName: candidate,
        passwordHash: hashHex,
        passwordSalt: saltHex,
        shortlistIds,
        compareIds: sanitizeIdList(guestLists?.compareIds, MAX_COMPARE_ITEMS),
        mutedCategories: [],
        strictTrustMode: false,
        favoriteTimestamps,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.putInMemory(existing);
    }

    return toPublicUser(existing);
  }

  async resetLocalPassword(
    rawIdentifier: string,
    newPassword: string,
  ): Promise<boolean> {
    const trimmed = rawIdentifier.trim();
    const isEmail = trimmed.includes("@") && !trimmed.startsWith("@");
    const existing = isEmail
      ? await this.findByEmail(trimmed)
      : await this.findByUsername(trimmed);
    if (!existing) return false;
    const { hashHex, saltHex } = hashPassword(newPassword);
    const updated: StoredUserRecord = {
      ...existing,
      passwordHash: hashHex,
      passwordSalt: saltHex,
      updatedAt: new Date().toISOString(),
    };
    this.putInMemory(updated);
    await this.tryUpsertSupabase(updated);
    return true;
  }

  async updateSyncedLists(
    userId: string,
    lists: { shortlistIds?: unknown; compareIds?: unknown },
  ): Promise<PublicUserSession | null> {
    const existing = await this.findById(userId);
    if (!existing) return null;

    const nowIso = new Date().toISOString();
    const nextShortlist =
      lists.shortlistIds !== undefined
        ? sanitizeIdList(lists.shortlistIds, MAX_SHORTLIST_ITEMS)
        : existing.shortlistIds;

    const nextTimestamps: Record<string, string> = {};
    for (const pid of nextShortlist) {
      nextTimestamps[pid] = existing.favoriteTimestamps?.[pid] ?? nowIso;
    }

    const updated: StoredUserRecord = {
      ...existing,
      shortlistIds: nextShortlist,
      compareIds:
        lists.compareIds !== undefined
          ? sanitizeIdList(lists.compareIds, MAX_COMPARE_ITEMS)
          : existing.compareIds,
      favoriteTimestamps: nextTimestamps,
      updatedAt: nowIso,
    };

    this.putInMemory(updated);
    await this.tryUpsertSupabase(updated);
    return toPublicUser(updated);
  }

  async updateProfilePreferences(
    userId: string,
    prefs: {
      displayName?: unknown;
      mutedCategories?: unknown;
      strictTrustMode?: unknown;
    },
  ): Promise<PublicUserSession | null> {
    const existing = await this.findById(userId);
    if (!existing) return null;

    const updated: StoredUserRecord = {
      ...existing,
      displayName:
        typeof prefs.displayName === "string"
          ? prefs.displayName.trim().slice(0, 48) || existing.username
          : existing.displayName,
      mutedCategories:
        prefs.mutedCategories !== undefined
          ? sanitizeIdList(prefs.mutedCategories, 20)
          : existing.mutedCategories,
      strictTrustMode:
        typeof prefs.strictTrustMode === "boolean"
          ? prefs.strictTrustMode
          : existing.strictTrustMode,
      updatedAt: new Date().toISOString(),
    };

    this.putInMemory(updated);
    return toPublicUser(updated);
  }
}

const g = globalThis as unknown as { __reviewLensUserStore?: UserStore };

export function getUserStore(): UserStore {
  if (!g.__reviewLensUserStore) {
    g.__reviewLensUserStore = new UserStore();
  }
  return g.__reviewLensUserStore;
}
