import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

// Anyone can apply to promote an event whose host opened applications
// (2026-11-11). The host approves or rejects; a rejected applicant can apply again.
const schema = z.object({ sharePercent: z.number().int().min(1).max(100).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));
    const event = await db.event.findUnique({
      where: { id },
      select: { title: true, status: true, creatorId: true, promotersOpen: true, promoterPayType: true, promoterMinPercent: true, promoterMaxPercent: true },
    });
    if (!event || event.status !== "PUBLISHED") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (event.creatorId === user.id) return NextResponse.json({ error: "You can't promote your own event" }, { status: 400 });
    if (!event.promotersOpen) return NextResponse.json({ error: "This event isn't taking promoters right now" }, { status: 400 });

    const pct = Math.min(event.promoterMaxPercent, Math.max(event.promoterMinPercent, body.sharePercent ?? event.promoterMaxPercent));
    const existing = await db.eventPromoter.findUnique({ where: { eventId_userId: { eventId: id, userId: user.id } } });
    if (existing && existing.status !== "REJECTED") return NextResponse.json({ promoter: existing });
    const promoter = existing
      ? await db.eventPromoter.update({ where: { id: existing.id }, data: { status: "PENDING", sharePercent: pct, decidedAt: null } })
      : await db.eventPromoter.create({ data: { eventId: id, userId: user.id, sharePercent: pct, status: "PENDING" } });

    notifyUsersAfterResponse([event.creatorId], {
      kind: "COLLABORATION",
      title: "New promoter application",
      body: `${user.displayName} wants to promote "${event.title}". Review it in your event dashboard.`,
      url: `/profile/catalog/events/${id}/dashboard`,
    });
    return NextResponse.json({ promoter }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
