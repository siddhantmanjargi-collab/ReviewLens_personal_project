import { NextRequest } from "next/server";
import { readAdminKey } from "@/lib/auth";
import { buildContext } from "@/lib/context";
import { handleImportProduct } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function POST(req: NextRequest) {
  const ctx = buildContext();
  const body = await req.json().catch(() => null);
  return toNextResponse(await handleImportProduct(ctx, readAdminKey(req.headers), body));
}
