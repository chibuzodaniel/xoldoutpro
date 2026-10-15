import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { sendGuestVerificationCodeEmail } from "@/lib/email";

// Guest checkout email check (explicit ask, 2026-10-15: "send a verification
// code to the email and validate the code to continue"). Before this, the
// email typed into GuestInfoSheet was trusted as-is — a typo created an
// account for (or attached the purchase to an existing account of) someone
// else entirely, and their receipts went there too.
//
// Flow: sendGuestCode emails a 6-digit code → verifyGuestCode checks it and
// hands back a random token → POST /api/orders only accepts a guest order
// carrying a token for that same email (isGuestEmailVerified), so the check
// can't be skipped by calling the API directly.

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
// How long one successful check covers further guest checkouts from the
// same browser (buying a second item shouldn't need a second code).
const TOKEN_TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_CODES_PER_EMAIL_PER_HOUR = 5;
const MAX_CODES_PER_IP_PER_HOUR = 15;

export class GuestVerificationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function hashCode(rowId: string, code: string) {
  return createHash("sha256").update(`${rowId}:${code}`).digest("hex");
}

export async function sendGuestCode(args: { email: string; name: string; ip: string | null }) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recentForEmail, recentForIp] = await Promise.all([
    db.guestEmailVerification.findMany({
      where: { email: args.email, createdAt: { gt: hourAgo } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    args.ip ? db.guestEmailVerification.count({ where: { ip: args.ip, createdAt: { gt: hourAgo } } }) : 0,
  ]);
  if (recentForEmail[0] && Date.now() - recentForEmail[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new GuestVerificationError("Please wait a few seconds before asking for another code.", 429);
  }
  if (recentForEmail.length >= MAX_CODES_PER_EMAIL_PER_HOUR || recentForIp >= MAX_CODES_PER_IP_PER_HOUR) {
    throw new GuestVerificationError("Too many codes requested. Try again in an hour.", 429);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = await db.guestEmailVerification.create({
    data: { email: args.email, codeHash: "", expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000), ip: args.ip },
  });
  await db.guestEmailVerification.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });

  const sent = await sendGuestVerificationCodeEmail({ to: args.email, buyerName: args.name, code, minutes: CODE_TTL_MINUTES });
  if (!sent) throw new GuestVerificationError("We couldn't send the code. Check the email address and try again.", 502);
}

/** Checks the latest code sent to this email; returns the proof token on success. */
export async function verifyGuestCode(args: { email: string; code: string }): Promise<string> {
  const row = await db.guestEmailVerification.findFirst({
    where: { email: args.email, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt < new Date()) throw new GuestVerificationError("That code has expired. Send a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new GuestVerificationError("Too many wrong tries. Send a new code.");

  // Count the attempt before comparing, so parallel guesses can't each get a free try.
  await db.guestEmailVerification.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(row.id, args.code.trim()), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new GuestVerificationError(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code.");
  }

  const token = randomBytes(32).toString("hex");
  const claimed = await db.guestEmailVerification.updateMany({
    where: { id: row.id, verifiedAt: null },
    data: { verifiedAt: new Date(), token },
  });
  if (claimed.count === 0) throw new GuestVerificationError("That code was already used. Send a new one.");
  return token;
}

/** What POST /api/orders checks before creating a guest order. */
export async function isGuestEmailVerified(email: string, token: string | undefined) {
  if (!token) return false;
  const row = await db.guestEmailVerification.findUnique({ where: { token }, select: { email: true, verifiedAt: true } });
  return Boolean(row?.verifiedAt && row.email === email && Date.now() - row.verifiedAt.getTime() < TOKEN_TTL_MS);
}
