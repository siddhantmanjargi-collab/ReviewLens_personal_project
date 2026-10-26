import { timingSafeEqual } from "node:crypto";

export function isAdminAuthorized(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readAdminKey(headers: Headers): string | null {
  return headers.get("x-admin-key") ?? headers.get("x-admin-api-key");
}
