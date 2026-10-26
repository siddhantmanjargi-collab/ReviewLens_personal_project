import { NextResponse } from "next/server";
import {
  buildSetSessionCookieHeader,
  checkAuthRateLimit,
  clearAuthFailures,
  createSessionToken,
  getClientRateKey,
  isValidEmail,
  normalizeEmail,
  recordAuthFailure,
} from "@/lib/auth";
import {
  createServerSupabaseClient,
  isSupabaseAuthConfigured,
  loadRelationalSupabaseProfile,
  syncRelationalSupabaseFavorites,
} from "@/lib/supabase/server";
import { getUserStore } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isValidEmail(body.email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { ok: false, error: "Enter the 6-digit verification code." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(body.email);
  const rateKey = getClientRateKey(req, `verify-otp:${email}`);
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many invalid code attempts. Wait ${rateCheck.retryAfterSeconds}s and retry.`,
      },
      { status: 429 },
    );
  }

  if (isSupabaseAuthConfigured()) {
    const supabase = createServerSupabaseClient(req);
    if (supabase) {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error || !data.user) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { ok: false, error: error?.message || "Invalid or expired verification code." },
          { status: 401 },
        );
      }

      clearAuthFailures(rateKey);
      const existingProfile = await loadRelationalSupabaseProfile(supabase, data.user);
      const shouldSeedGuestLists =
        existingProfile.shortlistIds.length === 0 &&
        existingProfile.compareIds.length === 0 &&
        ((Array.isArray(body.shortlistIds) && body.shortlistIds.length > 0) ||
          (Array.isArray(body.compareIds) && body.compareIds.length > 0));

      const finalProfile = shouldSeedGuestLists
        ? await syncRelationalSupabaseFavorites(supabase, data.user, {
            shortlistIds: body.shortlistIds,
            compareIds: body.compareIds,
          })
        : existingProfile;

      return NextResponse.json({
        ok: true,
        user: finalProfile,
        sessionToken: data.session?.access_token ?? null,
        supabaseConfigured: true,
      });
    }
  }

  const store = getUserStore();
  const verifiedUser = await store.verifyPreviewOtp(email, code, {
    shortlistIds: body.shortlistIds,
    compareIds: body.compareIds,
  });

  if (!verifiedUser) {
    recordAuthFailure(rateKey);
    return NextResponse.json(
      { ok: false, error: "Invalid or expired 6-digit code." },
      { status: 401 },
    );
  }

  clearAuthFailures(rateKey);
  const sessionToken = createSessionToken(verifiedUser);
  const res = NextResponse.json({
    ok: true,
    user: verifiedUser,
    sessionToken,
    supabaseConfigured: false,
  });
  res.headers.set("Set-Cookie", buildSetSessionCookieHeader(req, sessionToken));
  return res;
}
