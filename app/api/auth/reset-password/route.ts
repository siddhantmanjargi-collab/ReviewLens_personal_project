import { NextResponse } from "next/server";
import {
  checkAuthRateLimit,
  getClientRateKey,
  isValidEmail,
  normalizeEmail,
  recordAuthFailure,
} from "@/lib/auth";
import { resolveAppOrigin } from "@/lib/appOrigin";
import { createServerSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase/server";
import { getUserStore } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const rawTarget = typeof body.email === "string" ? body.email.trim() : "";
  if (!rawTarget) {
    return NextResponse.json(
      { ok: false, error: "Enter your account email address." },
      { status: 400 },
    );
  }

  const rateKey = getClientRateKey(req, `reset:${rawTarget}`);
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: `Please wait ${rateCheck.retryAfterSeconds}s before retrying.` },
      { status: 429 },
    );
  }

  if (isSupabaseAuthConfigured()) {
    if (!isValidEmail(rawTarget)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address for Supabase password recovery." },
        { status: 400 },
      );
    }
    const email = normalizeEmail(rawTarget);
    const supabase = createServerSupabaseClient(req);
    if (supabase) {
      const origin = resolveAppOrigin(req);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback`,
      });
      if (error) {
        recordAuthFailure(rateKey);
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        supabaseConfigured: true,
        message: `Password recovery link sent to ${email}.`,
      });
    }
  }

  // Local preview password update when newPassword is supplied
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 6) {
    return NextResponse.json(
      {
        ok: false,
        error: "In local preview mode, enter a new password of at least 6 characters to reset.",
      },
      { status: 400 },
    );
  }

  const store = getUserStore();
  const updated = await store.resetLocalPassword(rawTarget, newPassword);
  if (!updated) {
    recordAuthFailure(rateKey);
    return NextResponse.json(
      { ok: false, error: "No local preview account matched that email or @username." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    supabaseConfigured: false,
    message: "Password updated for your local preview account. You can sign in now.",
  });
}
