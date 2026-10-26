import { NextResponse } from "next/server";
import { buildClearSessionCookieHeader } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient(req);
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Clear local cookie regardless
    }
  }

  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", buildClearSessionCookieHeader(req));
  return res;
}
