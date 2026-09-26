/** Landing origins allowed to read public members-app JSON (flags only, no secrets). */
export const PUBLIC_CORS_ORIGINS = [
  "https://ifn.community",
  "https://www.ifn.community",
];

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedPublicOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  return PUBLIC_CORS_ORIGINS.includes(origin) || LOCALHOST_ORIGIN.test(origin);
}

/** CORS headers for a public GET; echoes the origin only when allow-listed. */
export function publicCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedPublicOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
