import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";
import {
  loadRelationalSupabaseProfile,
  resolveSupabaseUserWithClient,
  updateRelationalSupabaseProfilePrefs,
} from "@/lib/supabase/server";
import { getUserStore, toPublicUser } from "@/lib/userStore";

export const dynamic = "force-dynamic";

async function resolveLocalUser(req: Request) {
  const session = readSessionFromRequest(req);
  if (!session) return null;
  const store = getUserStore();
  return (await store.findById(session.userId)) ?? (await store.findByUsername(session.username));
}

export async function GET(req: Request) {
  const supabaseCtx = await resolveSupabaseUserWithClient(req);
  if (supabaseCtx) {
    const profile = await loadRelationalSupabaseProfile(supabaseCtx.client, supabaseCtx.authUser);
    return NextResponse.json({ ok: true, user: profile });
  }

  const user = await resolveLocalUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const supabaseCtx = await resolveSupabaseUserWithClient(req);
  if (supabaseCtx) {
    const updated = await updateRelationalSupabaseProfilePrefs(
      supabaseCtx.client,
      supabaseCtx.authUser,
      {
        displayName: body.displayName,
        mutedCategories: body.mutedCategories,
        strictTrustMode: body.strictTrustMode,
      },
    );
    return NextResponse.json({ ok: true, user: updated });
  }

  const user = await resolveLocalUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const store = getUserStore();
  const updated = await store.updateProfilePreferences(user.id, {
    displayName: body.displayName,
    mutedCategories: body.mutedCategories,
    strictTrustMode: body.strictTrustMode,
  });

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: updated });
}
