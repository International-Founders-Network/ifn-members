import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
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
 * Create a short-lived signed GET URL for a private library object.
 * Returns 503-shaped result when storage env is missing (never invent a public URL).
 */
export type ContentDispositionMode = "inline" | "attachment";

function safeObjectBasename(objectKey: string): string {
  const basename = objectKey.split("/").pop() || "download";
  return basename.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * `attachment|inline; filename="v1.1-member-visa-pathways.pdf"`: basename keeps the
 * object name (slug included). Non-safe ASCII is replaced with `_`.
 * Use `attachment` for Download links; `inline` so Preview / open-in-tab opens the PDF.
 */
export function contentDisposition(
  objectKey: string,
  disposition: ContentDispositionMode = "attachment",
): string {
  return `${disposition}; filename="${safeObjectBasename(objectKey)}"`;
}

/** Download-oriented Content-Disposition (basename from object key). */
export function attachmentDisposition(objectKey: string): string {
  return contentDisposition(objectKey, "attachment");
}

/** Preview-oriented Content-Disposition (browser may render PDF in-tab). */
export function inlineDisposition(objectKey: string): string {
  return contentDisposition(objectKey, "inline");
}

/** Response Content-Type override so inline PDF/xlsx open with the right viewer. */
export function responseContentType(objectKey: string): string | undefined {
  const lower = objectKey.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return undefined;
}

export type SignedUrlOptions = {
  disposition?: ContentDispositionMode;
};

export async function createSignedDownloadUrl(
  objectKey: string,
  expiresIn: number = DEFAULT_EXPIRES,
  options: SignedUrlOptions = {},
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

  const disposition = options.disposition ?? "attachment";
  const contentType = responseContentType(objectKey);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentDisposition: contentDisposition(objectKey, disposition),
    ...(contentType ? { ResponseContentType: contentType } : {}),
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
  options: SignedUrlOptions = {},
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

  const signed = await createSignedDownloadUrl(objectKey, expiresIn, options);
  return signed.ok
    ? signed
    : { ok: false, status: 503, error: signed.reason, reason: "storage_not_configured" };
}

/** Safety cap on keys returned by one listing (1,000 per page). */
const MAX_LISTED_KEYS = 10_000;

/**
 * Every object key under `prefix` (ListObjectsV2, paginated). Returns null when R2 env
 * is missing so callers can fall back to the serial registry + Neon rows. Throws on R2 errors.
 */
export async function listObjectKeys(prefix: string): Promise<string[] | null> {
  const client = getR2Client();
  if (!client) return null;

  const bucket = process.env.R2_BUCKET!.trim();
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < MAX_LISTED_KEYS);

  return keys;
}

/**
 * All keys under `library/` (serial folders `library/<NNN>-<slug>/`). Null when R2 env
 * is missing.
 */
export function listLibraryObjectKeys(): Promise<string[] | null> {
  return listObjectKeys("library/");
}
