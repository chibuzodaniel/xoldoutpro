import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Public — a claim link (PRD §7.3: "works over WhatsApp") has to be
// previewable by someone who isn't signed in yet, before they decide to log
// in and claim it.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gift = await db.gift.findUnique({
    where: { claimToken: token },
    include: {
      giver: { select: { displayName: true, handle: true } },
      product: {
        select: {
          id: true,
          title: true,
          type: true,
          release: { select: { artworkLadder: true } },
          beat: { select: { coverImageLadder: true } },
        },
      },
    },
  });
  if (!gift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    status: gift.status,
    expiresAt: gift.expiresAt,
    giver: gift.giver,
    product: gift.product,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { token } = await params;

    const gift = await db.gift.findUnique({ where: { claimToken: token } });
    if (!gift) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (gift.giverId === user.id) return NextResponse.json({ error: "You can't claim your own gift" }, { status: 400 });
    if (gift.status === "EXPIRED") return NextResponse.json({ error: "This gift has expired" }, { status: 410 });
    if (gift.status !== "PENDING") return NextResponse.json({ error: "This gift has already been claimed" }, { status: 409 });
    if (gift.expiresAt < new Date()) return NextResponse.json({ error: "This gift has expired" }, { status: 410 });

    const product = await db.product.findUniqueOrThrow({ where: { id: gift.productId } });

    // EVENT tickets are the one giftable type someone might reasonably
    // already own a copy of independently (they bought their own ticket,
    // then also got gifted one) — RELEASE/BEAT stay single-copy.
    if (product.type !== "EVENT") {
      const existing = await db.entitlement.findFirst({ where: { userId: user.id, productId: gift.productId } });
      if (existing && !existing.revokedAt) {
        return NextResponse.json({ error: "You already own this" }, { status: 409 });
      }
    }

    const claimed = await db.$transaction(async (tx) => {
      const claim = await tx.gift.updateMany({
        where: { id: gift.id, status: "PENDING" },
        data: { status: "CLAIMED", claimedById: user.id, claimedAt: new Date() },
      });
      if (claim.count === 0) return false; // lost a race with another claim attempt

      const entitlement = await tx.entitlement.create({
        data: { userId: user.id, productId: gift.productId, orderId: gift.orderId },
      });
      // Stock was already confirmed at purchase time (PRD §7.3); claiming
      // doesn't touch StockPolicy at all, only who holds the resulting entitlement.
      if (product.type === "EVENT") {
        await tx.ticketCheckIn.create({ data: { entitlementId: entitlement.id } });
      }
      return true;
    });

    if (!claimed) return NextResponse.json({ error: "This gift has already been claimed" }, { status: 409 });

    return NextResponse.json({ ok: true, productId: gift.productId });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
