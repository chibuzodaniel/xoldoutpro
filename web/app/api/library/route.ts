import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const entitlements = await db.entitlement.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          include: {
            creator: { select: { displayName: true, handle: true } },
            release: { include: { tracks: { orderBy: { order: "asc" } } } },
            beat: true,
            merchItem: true,
            ticketTier: { include: { event: true } },
          },
        },
        order: { include: { merchFulfillment: true } },
        checkIn: true,
      },
    });
    return NextResponse.json({ entitlements });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
