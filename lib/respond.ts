import { NextResponse } from "next/server";
import type { HandlerResult } from "./handlers";

export function toNextResponse(res: HandlerResult): NextResponse {
  return NextResponse.json(res.body, { status: res.status });
}
