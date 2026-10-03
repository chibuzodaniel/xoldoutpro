import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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
 * Short-TTL signed GET for paid/preview audio streaming. Never cache the
 * URL server-side. A real file *download* (not playback) doesn't use this
 * at all — see lib/audio/serveDownload.ts, which proxies the file through
 * our own server instead of a presigned URL, since it needs to embed
 * XOLDOUT/artist/artwork tags into the bytes before they reach the buyer.
 */
export async function presignDownload(key: string, expiresSeconds = 300, opts?: { filename?: string; contentType?: string }) {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    // A file *download* link (lib/audio/serveDownload.ts) forces a save with
    // the right filename; playback links leave these unset.
    ResponseContentDisposition: opts?.filename ? `attachment; filename="${opts.filename}"` : undefined,
    ResponseContentType: opts?.contentType,
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

/** Whether an object exists — a cheap HEAD, used to reuse cached derived files (e.g. tagged downloads). */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as { name?: string }).name === "NotFound") return false;
    throw err;
  }
}
