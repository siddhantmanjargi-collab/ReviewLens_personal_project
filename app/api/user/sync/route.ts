import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";
import {
  loadRelationalSupabaseProfile,
  resolveSupabaseUserWithClient,
  syncRelationalSupabaseFavorites,
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
    return NextResponse.json({
      ok: true,
      shortlistIds: profile.shortlistIds,
      compareIds: profile.compareIds,
      favoriteTimestamps: profile.favoriteTimestamps,
      updatedAt: profile.updatedAt,
    });
  }

  const user = await resolveLocalUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  const pub = toPublicUser(user);
  return NextResponse.json({
    ok: true,
    shortlistIds: pub.shortlistIds,
    compareIds: pub.compareIds,
    favoriteTimestamps: pub.favoriteTimestamps,
    updatedAt: pub.updatedAt,
  });
}

export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const supabaseCtx = await resolveSupabaseUserWithClient(req);
  if (supabaseCtx) {
    const updated = await syncRelationalSupabaseFavorites(supabaseCtx.client, supabaseCtx.authUser, {
      shortlistIds: body.shortlistIds,
      compareIds: body.compareIds,
    });
    return NextResponse.json({
      ok: true,
      shortlistIds: updated.shortlistIds,
      compareIds: updated.compareIds,
      favoriteTimestamps: updated.favoriteTimestamps,
      updatedAt: updated.updatedAt,
    });
  }

  const user = await resolveLocalUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const store = getUserStore();
  const updated = await store.updateSyncedLists(user.id, {
    shortlistIds: body.shortlistIds,
    compareIds: body.compareIds,
  });

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    shortlistIds: updated.shortlistIds,
    compareIds: updated.compareIds,
    favoriteTimestamps: updated.favoriteTimestamps,
    updatedAt: updated.updatedAt,
  });
}
