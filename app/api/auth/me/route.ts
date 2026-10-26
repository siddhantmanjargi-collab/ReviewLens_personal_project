import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";
import {
  isSupabaseAuthConfigured,
  loadRelationalSupabaseProfile,
  resolveSupabaseUserWithClient,
} from "@/lib/supabase/server";
import { getUserStore, toPublicUser } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabaseConfigured = isSupabaseAuthConfigured();

  // 1. Check live Supabase Auth session (@supabase/ssr cookies or Bearer JWT)
  const supabaseCtx = await resolveSupabaseUserWithClient(req);
  if (supabaseCtx) {
    const profile = await loadRelationalSupabaseProfile(supabaseCtx.client, supabaseCtx.authUser);
    return NextResponse.json(
      {
        authenticated: true,
        user: profile,
        supabaseConfigured,
      },
      { status: 200 },
    );
  }

  // 2. Check local / @analyst workspace session
  const session = readSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { authenticated: false, supabaseConfigured },
      { status: 200 },
    );
  }

  const store = getUserStore();
  const user =
    (await store.findById(session.userId)) ?? (await store.findByUsername(session.username));
  if (!user) {
    return NextResponse.json(
      { authenticated: false, supabaseConfigured },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: toPublicUser(user),
      supabaseConfigured,
    },
    { status: 200 },
  );
}
