import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type SignedUrlResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; reason: string; status: 503 };

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
      reason:
        "Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET in Netlify env.",
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
