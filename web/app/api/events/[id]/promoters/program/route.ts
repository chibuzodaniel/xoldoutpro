import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Public: the event's promoter programme, and (signed in) the viewer's own
// application/link (2026-11-11).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, viewer] = await Promise.all([
    db.event.findUnique({
      where: { id },
      select: { status: true, creatorId: true, promotersOpen: true, promoterPayType: true, promoterMinPercent: true, promoterMaxPercent: true, promoterFlatKobo: true },
    }),
    getOptionalUser(req),
  ]);
  if (!event || event.status !== "PUBLISHED") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mine = viewer
    ? await db.eventPromoter.findUnique({
        where: { eventId_userId: { eventId: id, userId: viewer.id } },
        select: { id: true, status: true, sharePercent: true, code: true, clickCount: true },
      })
    : null;
  return NextResponse.json({
    open: event.promotersOpen,
    payType: event.promoterPayType,
    minPercent: event.promoterMinPercent,
    maxPercent: event.promoterMaxPercent,
    flatKobo: event.promoterFlatKobo,
    isHost: viewer?.id === event.creatorId,
    mine,
  });
}
