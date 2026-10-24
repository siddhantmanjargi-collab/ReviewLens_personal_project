import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of the x-admin-key header against ADMIN_API_KEY. */
export function isAdminAuthorized(headerValue: string | null, adminKey: string): boolean {
  if (!headerValue || !adminKey) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(adminKey);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
