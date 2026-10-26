import { NextRequest } from "next/server";
import { readAdminKey } from "@/lib/auth";
import { buildContext } from "@/lib/context";
import { handleImportReviews } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function POST(req: NextRequest) {
  const ctx = buildContext();
  const productId = req.nextUrl.searchParams.get("productId") ?? req.nextUrl.searchParams.get("id") ?? "";
  const body = await req.json().catch(() => null);
  return toNextResponse(await handleImportReviews(ctx, readAdminKey(req.headers), productId, body));
}
