import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Shared Neon (same project as landing). Prefer NETLIFY_DATABASE_URL for parity.
 */
export function getDatabaseUrl(): string | undefined {
  return (
    process.env.NETLIFY_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}

export function getSql(): NeonQueryFunction<false, false> | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  return neon(url);
}
