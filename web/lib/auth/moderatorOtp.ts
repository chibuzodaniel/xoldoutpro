import { randomInt, createHash, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes to actually receive and type the email
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Only the hash is ever persisted — same reasoning as never storing a
// password in plaintext. Deletes any still-pending code for this user
// first, so at most one code is ever live: an old, possibly-forwarded email
// can't still work once a fresh one has been requested.
export async function issueModeratorOtp(userId: string): Promise<string> {
  const code = generateOtpCode();
  await db.moderatorOtpCode.deleteMany({ where: { userId, consumedAt: null } });
  await db.moderatorOtpCode.create({
    data: { userId, codeHash: hashCode(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  return code;
}

export async function verifyModeratorOtp(userId: string, submittedCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const record = await db.moderatorOtpCode.findFirst({
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, error: "That code has expired — request a new one" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many attempts — request a new code" };

  const submittedHash = Buffer.from(hashCode(submittedCode));
  const storedHash = Buffer.from(record.codeHash);
  // Both are fixed-length hex SHA-256 digests, so the length check never
  // itself leaks anything timing-wise; timingSafeEqual throws on a length
  // mismatch rather than returning false, hence the guard.
  const matches = submittedHash.length === storedHash.length && timingSafeEqual(submittedHash, storedHash);

  if (!matches) {
    await db.moderatorOtpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "Incorrect code" };
  }

  await db.moderatorOtpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
