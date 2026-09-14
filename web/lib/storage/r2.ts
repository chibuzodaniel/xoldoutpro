import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible. Paid/preview audio is NEVER served from a
// public bucket URL (PRD §16) — every read goes through a short-TTL signed
// GET. Artwork/avatar/cover derivatives are low-stakes and can be public.
const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

function assertConfigured() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Object storage is not configured. Missing env vars: ${missing.join(", ")}. See .env.local.example.`,
    );
  }
}

function client() {
  assertConfigured();
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const bucket = () => process.env.R2_BUCKET!;

/** Presigned PUT URL for the client to upload directly to R2. */
export async function presignUpload(key: string, contentType: string, expiresSeconds = 600) {
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: expiresSeconds });
}

/**
 * Short-TTL signed GET for paid/preview audio. Never cache the URL server-side.
 *
 * `downloadFilename`, when passed, sets `ResponseContentDisposition:
 * attachment` on the signed URL — without it, opening the URL (in-app
 * `<audio>` playback, or a browser navigating straight to it) just streams/
 * plays the file inline, which is what plain playback wants. A real
 * "Download" action needs the attachment header explicitly: without it,
 * `window.location.href = url` on a plain audio object just opens Safari's
 * (or any browser's) inline player instead of saving anything — confirmed
 * gap on iOS, but not iOS-specific; no browser downloads a played-inline
 * audio/mpeg object without this header telling it to.
 */
export async function presignDownload(key: string, expiresSeconds = 300, downloadFilename?: string) {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ...(downloadFilename
      ? { ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/"/g, "")}"` }
      : {}),
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresSeconds });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function putObjectBuffer(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export function publicUrlFor(key: string) {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) throw new Error("R2_PUBLIC_BASE_URL is not set. See .env.local.example.");
  return `${base}/${key}`;
}
