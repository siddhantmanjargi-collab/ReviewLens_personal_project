export function resolveAppOrigin(req: Request, clientOriginHint?: unknown): string {
  const envAppUrl = process.env.APP_URL?.trim();
  if (envAppUrl) {
    try {
      return new URL(envAppUrl).origin;
    } catch {
      // Fall through if malformed
    }
  }

  if (typeof clientOriginHint === "string" && clientOriginHint.trim()) {
    try {
      const parsed = new URL(clientOriginHint.trim());
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Fall through
    }
  }

  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto.split(",")[0]!.trim()}://${forwardedHost.split(",")[0]!.trim()}`;
  }

  return new URL(req.url).origin;
}
