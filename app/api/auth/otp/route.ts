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

  if (!isValidEmail(body.email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address to receive a sign-in code." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(body.email);
  const rateKey = getClientRateKey(req, `otp:${email}`);
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Please wait ${rateCheck.retryAfterSeconds}s before requesting another code.`,
      },
      { status: 429 },
    );
  }

  if (isSupabaseAuthConfigured()) {
    const supabase = createServerSupabaseClient(req);
    if (supabase) {
      const origin = resolveAppOrigin(req);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) {
        recordAuthFailure(rateKey);
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        email,
        supabaseConfigured: true,
        message: `Sent a magic link and 6-digit verification code to ${email}.`,
      });
    }
  }

  // Local preview fallback so passwordless OTP login can be tested before adding Supabase Secrets
  const store = getUserStore();
  const issued = store.issuePreviewOtp(email);
  return NextResponse.json({
    ok: true,
    email,
    supabaseConfigured: false,
    previewCode: issued.code,
    message: `Local preview OTP generated for ${email}. Connect Supabase in Secrets to send live emails.`,
  });
}
