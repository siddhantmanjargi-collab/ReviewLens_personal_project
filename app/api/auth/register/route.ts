import { NextResponse } from "next/server";
import {
  buildSetSessionCookieHeader,
  checkAuthRateLimit,
  createSessionToken,
  getClientRateKey,
  recordAuthFailure,
  validateRegistrationInput,
} from "@/lib/auth";
import { resolveAppOrigin } from "@/lib/appOrigin";
import {
  createServerSupabaseClient,
  isSupabaseAuthConfigured,
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

  const rateKey = getClientRateKey(req, "register");
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many registration attempts. Please wait ${rateCheck.retryAfterSeconds}s.`,
      },
      { status: 429 },
    );
  }

  const validated = validateRegistrationInput({
    email: body.email,
    username: body.username,
    password: body.password,
  });
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  if (isSupabaseAuthConfigured()) {
    if (!validated.email) {
      return NextResponse.json(
        { ok: false, error: "An email address is required when creating a Supabase account." },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient(req);
    if (supabase) {
      const origin = resolveAppOrigin(req);
      const { data, error } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            username: validated.username,
            display_name: validated.username,
          },
        },
      });

      if (error || !data.user) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { ok: false, error: error?.message || "Could not create Supabase account." },
          { status: 400 },
        );
      }

      // If Supabase project has "Confirm email" enabled, session will be null until link/OTP is confirmed
      if (!data.session) {
        return NextResponse.json(
          {
            ok: true,
            emailConfirmationRequired: true,
            email: validated.email,
            message: `Check ${validated.email} to confirm your account, then sign in.`,
          },
          { status: 201 },
        );
      }

      const profile = await syncRelationalSupabaseFavorites(supabase, data.user, {
        shortlistIds: body.shortlistIds,
        compareIds: body.compareIds,
      });

      return NextResponse.json(
        {
          ok: true,
          user: profile,
          sessionToken: data.session.access_token,
          supabaseConfigured: true,
        },
        { status: 201 },
      );
    }
  }

  // Local / preview fallback registration
  const store = getUserStore();
  const created = await store.createUser({
    email: validated.email,
    username: validated.username,
    password: validated.password,
    shortlistIds: body.shortlistIds,
    compareIds: body.compareIds,
  });

  if (!created.ok) {
    recordAuthFailure(rateKey);
    return NextResponse.json({ ok: false, error: created.error }, { status: created.status });
  }

  const sessionToken = createSessionToken(created.user);
  const res = NextResponse.json(
    {
      ok: true,
      user: created.user,
      sessionToken,
      supabaseConfigured: false,
    },
    { status: 201 },
  );
  res.headers.set("Set-Cookie", buildSetSessionCookieHeader(req, sessionToken));
  return res;
}
