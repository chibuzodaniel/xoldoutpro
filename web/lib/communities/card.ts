import { randomInt } from "crypto";
import { db } from "@/lib/db";

// Membership ID / card code (v2): the unique ID printed on the membership card
// and held by its QR. Made once per membership: on first view for older
// members, at purchase for guest checkouts (2026-11-16).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(name: string) {
  const prefix = (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "XOL").toUpperCase();
  let rest = "";
  for (let i = 0; i < 7; i++) rest += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${rest}`;
}

/** The membership's card code, creating it if it has none yet. Null if there's no such membership. */
export async function ensureCardCode(groupId: string, userId: string, communityName: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await db.membership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { cardCode: true } });
    if (!current) return null;
    if (current.cardCode) return current.cardCode;
    const set = await db.membership
      .updateMany({ where: { groupId, userId, cardCode: null }, data: { cardCode: makeCode(communityName) } })
      .catch(() => ({ count: 0 })); // unique clash: try another code
    if (set.count > 0) continue; // re-read the code we just set
  }
  return (await db.membership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { cardCode: true } }))?.cardCode ?? null;
}
