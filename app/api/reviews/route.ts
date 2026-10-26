import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { handleListReviews } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  const productId = req.nextUrl.searchParams.get("productId") ?? req.nextUrl.searchParams.get("id") ?? "";
  return toNextResponse(await handleListReviews(ctx, productId, req.nextUrl.searchParams));
}
