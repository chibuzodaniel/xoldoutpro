import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Manage subscription: the fan's auto-renew switch ("Cancel renewal" /
// "Resume renewal"). Turning it off never ends access early — the period
// that was paid for runs to its end.
const patchSchema = z.object({ autoRenew: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { autoRenew } = patchSchema.parse(await req.json());
    const updated = await db.catalogSubscription.updateMany({
      where: { id, subscriberId: user.id },
      // Turning it back on allows this period's reminder/charge again.
      data: autoRenew ? { autoRenew, renewalNotifiedAt: null } : { autoRenew },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, autoRenew });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    throw err;
  }
}
