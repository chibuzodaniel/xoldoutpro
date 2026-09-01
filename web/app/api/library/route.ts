import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const entitlements = await db.entitlement.findMany({
      where: { userId: user.id, revokedAt: null },
      // Pinned items float to the top (most-recently-pinned first), then
      // everything else by purchase date as before.
      orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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

const patchSchema = z.object({ entitlementId: z.string().min(1), pinned: z.boolean() });

// Long-press "Pin"/"Unpin" (Library) — scoped to the requesting user's own
// entitlement via the where clause below, not just the id, so one user can
// never pin/unpin another's purchase by guessing an id.
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { entitlementId, pinned } = patchSchema.parse(await req.json());
    const result = await db.entitlement.updateMany({
      where: { id: entitlementId, userId: user.id },
      data: { pinnedAt: pinned ? new Date() : null },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
