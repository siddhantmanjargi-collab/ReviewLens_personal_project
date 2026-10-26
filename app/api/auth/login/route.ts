import { NextResponse } from "next/server";
import {
  buildSetSessionCookieHeader,
  checkAuthRateLimit,
  clearAuthFailures,
  createSessionToken,
  getClientRateKey,
  recordAuthFailure,
  validateLoginIdentifier,
} from "@/lib/auth";
import {
  createServerSupabaseClient,
  createServiceSupabaseClient,
  isSupabaseAuthConfigured,
  loadRelationalSupabaseProfile,
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

  const rawIdentifier = body.identifier ?? body.username ?? body.email;
  const rateKey = getClientRateKey(
    req,
    typeof rawIdentifier === "string" ? rawIdentifier : "login",
  );
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many failed sign-in attempts. Please wait ${rateCheck.retryAfterSeconds}s before retrying.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
      },
    );
  }

  const validated = validateLoginIdentifier(rawIdentifier, body.password);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  // Always allow the pre-seeded @analyst workspace evaluation account
  const isDemoAnalyst =
    (!validated.isEmail && validated.identifier === "analyst") ||
    validated.identifier === "analyst@reviewlens.in";

  if (isSupabaseAuthConfigured() && !isDemoAnalyst) {
    const supabase = createServerSupabaseClient(req);
    if (supabase) {
      let targetEmail: string | null = validated.isEmail ? validated.identifier : null;

      // Resolve @username -> email via public.profiles if service-role key is configured
      if (!targetEmail) {
        const serviceClient = createServiceSupabaseClient() ?? supabase;
        try {
          const { data: profileRow } = await serviceClient
            .from("profiles")
            .select("email")
            .eq("username", validated.identifier)
            .maybeSingle();
          if (profileRow && typeof profileRow.email === "string" && profileRow.email) {
            targetEmail = profileRow.email;
          }
        } catch {
          // Table may not exist yet; proceed cleanly
        }
      }

      if (!targetEmail) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          {
            ok: false,
            error:
              "Enter your registered email address to sign in with Supabase Auth (or use @analyst for the demo workspace).",
          },
          { status: 401 },
        );
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: validated.password,
      });

      if (error || !data.user) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { ok: false, error: error?.message || "Invalid email or password." },
          { status: 401 },
        );
      }

      clearAuthFailures(rateKey);
      const profile = await loadRelationalSupabaseProfile(supabase, data.user);
      return NextResponse.json({
        ok: true,
        user: profile,
        sessionToken: data.session?.access_token ?? null,
        supabaseConfigured: true,
      });
    }
  }

  // Local / preview fallback store (plus @analyst demo workspace)
  const store = getUserStore();
  let user = await store.authenticateUser(validated.identifier, validated.password);
  if (!user) {
    // If user does not exist yet in local store, auto-register them seamlessly on the fly
    const email = validated.isEmail ? validated.identifier : `${validated.identifier}@reviewlens.local`;
    const username = validated.isEmail ? validated.identifier.split("@")[0]! : validated.identifier;
    const createdResult = await store.createUser({
      email,
      username,
      password: validated.password,
    });
    if (createdResult.ok) {
      user = createdResult.user;
    } else {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { ok: false, error: createdResult.error || "Invalid email, username, or password." },
        { status: 401 },
      );
    }
  }

  clearAuthFailures(rateKey);
  const sessionToken = createSessionToken(user);
  const res = NextResponse.json({
    ok: true,
    user,
    sessionToken,
    supabaseConfigured: isSupabaseAuthConfigured(),
  });
  res.headers.set("Set-Cookie", buildSetSessionCookieHeader(req, sessionToken));
  return res;
}
