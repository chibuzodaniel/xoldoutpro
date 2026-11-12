import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { downloadsEnabled } from "@/lib/audio/serveDownload";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const canDownload = await downloadsEnabled();
    const entitlements = await db.entitlement.findMany({
      // Purchases the buyer removed from their library stay owned but aren't listed.
      where: { userId: user.id, revokedAt: null, hiddenAt: null },
      // Pinned items float to the top (most-recently-pinned first), then
      // everything else by purchase date as before.
      orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      include: {
        product: {
          include: {
            creator: { select: { displayName: true, handle: true, countryCode: true } },
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
    // Explicit ask: when a super-moderator turns real-file downloads off,
    // the download controls should disappear entirely — in-app
    // streaming/offline caching (lib/offline/downloads.ts) keeps working.
    return NextResponse.json({ entitlements, downloadsEnabled: canDownload });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const patchSchema = z
  .object({ entitlementId: z.string().min(1), pinned: z.boolean().optional(), hidden: z.boolean().optional() })
  .refine((b) => b.pinned !== undefined || b.hidden !== undefined, { message: "Nothing to change" });

// Long-press "Pin"/"Unpin" (Library) — scoped to the requesting user's own
// entitlement via the where clause below, not just the id, so one user can
// never pin/unpin another's purchase by guessing an id.
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { entitlementId, pinned, hidden } = patchSchema.parse(await req.json());
    const result = await db.entitlement.updateMany({
      where: { id: entitlementId, userId: user.id },
      data: {
        ...(pinned !== undefined ? { pinnedAt: pinned ? new Date() : null } : {}),
        // "Remove from library" (2026-11-11) — the buyer's own list only.
        ...(hidden !== undefined ? { hiddenAt: hidden ? new Date() : null } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
