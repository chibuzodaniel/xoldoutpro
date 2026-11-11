import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

// A visit through a promoter's link (2026-11-11). The page sends this once
// per browser session per link; one indexed update, no read.
const schema = z.object({ code: z.string().min(1).max(64) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await db.eventPromoter.updateMany({ where: { code: parsed.data.code, eventId: id, status: "APPROVED" }, data: { clickCount: { increment: 1 } } });
  return NextResponse.json({ ok: true });
}
