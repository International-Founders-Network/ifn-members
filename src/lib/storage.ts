import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type SignedUrlResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; reason: string; status: 503 };

export type ExistingObjectUrlResult =
  | { ok: true; url: string; expiresIn: number }
  | {
      ok: false;
      status: 403 | 502 | 503;
      error: string;
      reason: "object_missing" | "storage_error" | "storage_not_configured";
    };

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET?.trim(),
  );
}

function getR2Client(): S3Client | null {
  if (!r2Configured()) return null;
  const accountId = process.env.R2_ACCOUNT_ID!.trim();
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });
}

const DEFAULT_EXPIRES = 60 * 15; // 15 minutes

const NOT_CONFIGURED_REASON =
  "Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET in Netlify env.";

/**
 * Create a short-lived signed GET URL for a private Pack A object.
 * Returns 503-shaped result when storage env is missing (never invent a public URL).
 */
export async function createSignedDownloadUrl(
  objectKey: string,
  expiresIn: number = DEFAULT_EXPIRES,
): Promise<SignedUrlResult> {
  if (!r2Configured()) {
    return {
      ok: false,
      status: 503,
      reason: NOT_CONFIGURED_REASON,
    };
  }

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET!.trim();
  if (!client) {
    return {
      ok: false,
      status: 503,
      reason: "Object storage client failed to initialize.",
    };
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return { ok: true, url, expiresIn };
}

/** Shorter TTL for Admin previews and public landing downloads (redirected immediately). */
export const SHORT_SIGNED_URL_EXPIRES = 60 * 5; // 5 minutes

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

/**
 * HeadObject first, then sign. A missing key returns 403 `object_missing` with the key
 * in the message so Admin can see exactly what Content still has to upload.
 */
export async function createSignedUrlForExistingObject(
  objectKey: string,
  expiresIn: number = SHORT_SIGNED_URL_EXPIRES,
): Promise<ExistingObjectUrlResult> {
  const client = getR2Client();
  if (!client) {
    return {
      ok: false,
      status: 503,
      error: NOT_CONFIGURED_REASON,
      reason: "storage_not_configured",
    };
  }

  try {
    await client.send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET!.trim(), Key: objectKey }),
    );
  } catch (error) {
    if (isNotFound(error)) {
      return {
        ok: false,
        status: 403,
        error: `Object not found in R2: ${objectKey}`,
        reason: "object_missing",
      };
    }
    console.error(
      "R2 HeadObject failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return {
      ok: false,
      status: 502,
      error: "Could not reach object storage.",
      reason: "storage_error",
    };
  }

  const signed = await createSignedDownloadUrl(objectKey, expiresIn);
  return signed.ok
    ? signed
    : { ok: false, status: 503, error: signed.reason, reason: "storage_not_configured" };
}
