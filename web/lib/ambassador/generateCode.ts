import { randomBytes } from "crypto";
import { db } from "@/lib/db";

function randomCode() {
  return randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
}

/** Lazily generated once, at approval — mirrors lib/handle.ts's collision-retry style. */
export async function generateUniqueAmbassadorCode() {
  let candidate = randomCode();
  while (await db.user.findUnique({ where: { ambassadorCode: candidate } })) {
    candidate = randomCode();
  }
  return candidate;
}
