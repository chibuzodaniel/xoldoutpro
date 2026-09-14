import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { publicUrlFor } from "@/lib/storage/r2";
import {
  createBillboardCheckout,
  getBillboardDailyRateKobo,
  BillboardConflictError,
  MIN_BILLBOARD_DAYS,
  MAX_BILLBOARD_DAYS,
} from "@/lib/commerce/billboards";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    // Most recent regardless of status — a REJECTED row is how the creator
    // sees the moderator's reason, not filtered out.
    const [billboard, dailyRateKobo] = await Promise.all([
      db.billboard.findFirst({ where: { creatorId: user.id }, orderBy: { createdAt: "desc" } }),
      getBillboardDailyRateKobo(),
    ]);
    return NextResponse.json({ billboard, dailyRateKobo, minDays: MIN_BILLBOARD_DAYS, maxDays: MAX_BILLBOARD_DAYS });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const bodySchema = z.object({ key: z.string().min(1), days: z.number().int().positive() });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { key, days } = bodySchema.parse(await req.json());

    const result = await createBillboardCheckout({
      creatorId: user.id,
      artworkUrl: publicUrlFor(key),
      days,
      origin: req.nextUrl.origin,
      customerEmail: user.email,
      customerName: user.displayName,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof BillboardConflictError) {
      return NextResponse.json({ error: "You already have a billboard live or awaiting payment." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not start billboard checkout" }, { status: 502 });
  }
}
