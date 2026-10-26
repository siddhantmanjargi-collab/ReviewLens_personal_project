import { NextResponse } from "next/server";
import { resolveAppOrigin } from "@/lib/appOrigin";
import { createServerSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawProvider = url.searchParams.get("provider");
  const provider = rawProvider === "github" ? "github" : "google";

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        supabaseConfigured: false,
        error:
          "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Secrets (and enable Google/GitHub in your Supabase Auth Providers) to use OAuth sign-in.",
      },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient(req);
  if (!supabase) {
    return NextResponse.json(
      { ok: false, supabaseConfigured: false, error: "Supabase client unavailable." },
      { status: 400 },
    );
  }

  const origin = resolveAppOrigin(req, url.searchParams.get("origin"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?popup=1`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.json(
      { ok: false, supabaseConfigured: true, error: error?.message || "Could not start OAuth flow." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    supabaseConfigured: true,
    url: data.url,
  });
}
