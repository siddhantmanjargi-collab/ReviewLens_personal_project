import { NextResponse } from "next/server";
import { buildContext, type RequestContext } from "./context";
import type { HandlerResult } from "./handlers";

/** Builds the context and runs a handler. Internal errors are logged server-side, never leaked. */
export async function run(fn: (ctx: RequestContext) => Promise<HandlerResult>): Promise<NextResponse> {
  try {
    const result = await fn(buildContext());
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[reviewlens] unhandled error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
