import { NextResponse } from "next/server";
import { z } from "zod";
import { readSessionFromRequest } from "@/lib/auth";
import { buildContext } from "@/lib/context";
import { analyzeProductLink } from "@/lib/linkAnalyzer";
import { resolveSupabaseUserWithClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().trim().min(1, "Please paste a product URL."),
  shortlistIds: z.array(z.string()).max(60).optional(),
});

export async function POST(req: Request) {
  // Require authenticated workspace session (Supabase or local session)
  const supabaseCtx = await resolveSupabaseUserWithClient(req);
  const localSession = supabaseCtx ? null : readSessionFromRequest(req);
  if (!supabaseCtx && !localSession) {
    return NextResponse.json(
      { ok: false, error: "Please sign in to inspect product links." },
      { status: 401 },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL payload." },
      { status: 400 },
    );
  }

  const ctx = buildContext();
  const outcome = await analyzeProductLink({
    rawUrl: parsed.data.url,
    repo: ctx.repo,
    geminiApiKey: process.env.GEMINI_API_KEY,
    shortlistIds: parsed.data.shortlistIds,
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true, report: outcome.report }, { status: 200 });
}
