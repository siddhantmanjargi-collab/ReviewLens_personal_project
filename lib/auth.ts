import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "rl_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Sliding-window brute-force rate limiter (per client IP + identifier)
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 8;

interface RateBucket {
  timestamps: number[];
}

const gRate = globalThis as unknown as { __rlAuthRateBuckets?: Map<string, RateBucket> };

function getRateBuckets(): Map<string, RateBucket> {
  if (!gRate.__rlAuthRateBuckets) {
    gRate.__rlAuthRateBuckets = new Map<string, RateBucket>();
  }
  return gRate.__rlAuthRateBuckets;
}

export function getClientRateKey(req: Request, identifier = "global"): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : "local";
  return `${ip}:${identifier.trim().toLowerCase().slice(0, 64)}`;
}

export function checkAuthRateLimit(
  key: string,
  nowMs = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const buckets = getRateBuckets();
  const existing = buckets.get(key);
  if (!existing) return { allowed: true };

  const active = existing.timestamps.filter((ts) => nowMs - ts < RATE_LIMIT_WINDOW_MS);
  if (active.length === 0) {
    buckets.delete(key);
    return { allowed: true };
  }
  existing.timestamps = active;

  if (active.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    const oldest = active[0]!;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((RATE_LIMIT_WINDOW_MS - (nowMs - oldest)) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordAuthFailure(key: string, nowMs = Date.now()): void {
  const buckets = getRateBuckets();
  const existing = buckets.get(key) ?? { timestamps: [] };
  existing.timestamps = existing.timestamps
    .filter((ts) => nowMs - ts < RATE_LIMIT_WINDOW_MS)
    .concat(nowMs);
  buckets.set(key, existing);
}

export function clearAuthFailures(key: string): void {
  getRateBuckets().delete(key);
}

export function isAdminAuthorized(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readAdminKey(headers: Headers): string | null {
  return headers.get("x-admin-key") ?? headers.get("x-admin-api-key");
}

export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: unknown): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 160 && EMAIL_REGEX.test(email);
}

export function validateCredentials(
  rawUsername: unknown,
  rawPassword: unknown,
): { ok: true; username: string; password: string } | { ok: false; error: string } {
  const username = normalizeUsername(rawUsername);
  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      error: "Username must be 3–24 characters using lowercase letters, numbers, or underscores.",
    };
  }
  if (typeof rawPassword !== "string" || rawPassword.length < 6) {
    return {
      ok: false,
      error: "Password must be at least 6 characters long.",
    };
  }
  if (rawPassword.length > 128) {
    return {
      ok: false,
      error: "Password must be 128 characters or fewer.",
    };
  }
  return { ok: true, username, password: rawPassword };
}

export function validateLoginIdentifier(
  rawIdentifier: unknown,
  rawPassword: unknown,
):
  | { ok: true; identifier: string; isEmail: boolean; password: string }
  | { ok: false; error: string } {
  if (typeof rawIdentifier !== "string" || !rawIdentifier.trim()) {
    return { ok: false, error: "Enter your email address or @username." };
  }
  const trimmed = rawIdentifier.trim();
  const isEmail = trimmed.includes("@") && !trimmed.startsWith("@");
  if (isEmail) {
    const email = normalizeEmail(trimmed);
    if (!isValidEmail(email)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (typeof rawPassword !== "string" || rawPassword.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters long." };
    }
    return { ok: true, identifier: email, isEmail: true, password: rawPassword };
  }

  const creds = validateCredentials(trimmed, rawPassword);
  if (!creds.ok) return creds;
  return { ok: true, identifier: creds.username, isEmail: false, password: creds.password };
}

export function validateRegistrationInput(input: {
  email?: unknown;
  username?: unknown;
  password?: unknown;
}):
  | { ok: true; email: string | null; username: string; password: string }
  | { ok: false; error: string } {
  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  let email: string | null = null;
  if (rawEmail) {
    if (!isValidEmail(rawEmail)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    email = normalizeEmail(rawEmail);
  }

  const rawUsername =
    typeof input.username === "string" && input.username.trim()
      ? input.username
      : email
        ? email.split("@")[0]
        : "";

  const creds = validateCredentials(rawUsername, input.password);
  if (!creds.ok) return creds;

  return {
    ok: true,
    email,
    username: creds.username,
    password: creds.password,
  };
}

export function hashPassword(
  password: string,
  existingSaltHex?: string,
): { hashHex: string; saltHex: string } {
  const saltHex = existingSaltHex ?? randomBytes(16).toString("hex");
  const derived = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return { hashHex: derived.toString("hex"), saltHex };
}

export function verifyPassword(
  password: string,
  expectedHashHex: string,
  saltHex: string,
): boolean {
  try {
    const { hashHex } = hashPassword(password, saltHex);
    const a = Buffer.from(hashHex, "hex");
    const b = Buffer.from(expectedHashHex, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: string;
  username: string;
  issuedAt: number;
  expiresAt: number;
}

function getSessionSecret(): string {
  const envSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  return "reviewlens-local-session-signing-secret-v1";
}

function signBase64Url(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function createSessionToken(
  user: { id: string; username: string },
  nowMs = Date.now(),
): string {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    issuedAt: nowMs,
    expiresAt: nowMs + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signBase64Url(encodedPayload, getSessionSecret());
  return `${encodedPayload}.${sig}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  nowMs = Date.now(),
): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = signBase64Url(encodedPayload, getSessionSecret());
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      typeof decoded.userId !== "string" ||
      typeof decoded.username !== "string" ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= nowMs
    ) {
      return null;
    }
    return {
      userId: decoded.userId,
      username: decoded.username,
      issuedAt: typeof decoded.issuedAt === "number" ? decoded.issuedAt : nowMs,
      expiresAt: decoded.expiresAt,
    };
  } catch {
    return null;
  }
}

function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const eqIdx = segment.indexOf("=");
    if (eqIdx === -1) continue;
    const key = segment.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(segment.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer && bearer.split(".").length === 2) return bearer;
  }
  return parseCookieValue(req.headers.get("cookie"), SESSION_COOKIE_NAME);
}

export function readSessionFromRequest(req: Request): SessionPayload | null {
  const token = extractSessionToken(req);
  return verifySessionToken(token);
}

function isHttpsRequest(req: Request): boolean {
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

export function buildSetSessionCookieHeader(req: Request, token: string): string {
  const secure = isHttpsRequest(req);
  const sameSite = secure ? "None; Secure" : "Lax";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=${sameSite}`;
}

export function buildClearSessionCookieHeader(req: Request): string {
  const secure = isHttpsRequest(req);
  const sameSite = secure ? "None; Secure" : "Lax";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=${sameSite}`;
}
