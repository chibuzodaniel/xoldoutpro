import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { publicUrlFor } from "@/lib/storage/r2";
import {
  createBillboardCheckout,
  getBillboardDailyRateKobo,
  BillboardConflictError,
  InvalidPromotedItemError,
  resolvePromotedItem,
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

const promotedSchema = z.object({ kind: z.enum(["RELEASE", "BEAT", "MERCH", "EVENT"]), id: z.string().min(1) });

const bodySchema = z.object({
  key: z.string().min(1),
  days: z.number().int().positive(),
  // Optional song/beat/merch/event the billboard links to (else the creator profile).
  promoted: promotedSchema.nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { key, days, promoted } = bodySchema.parse(await req.json());
    const promotedIds = await resolvePromotedItem(user.id, promoted ?? null);

    const result = await createBillboardCheckout({
      creatorId: user.id,
      artworkUrl: publicUrlFor(key),
      days,
      origin: req.nextUrl.origin,
      customerEmail: user.email,
      customerName: user.displayName,
      promoted: promotedIds,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof InvalidPromotedItemError) {
      return NextResponse.json({ error: "Pick one of your own published songs, beats, merch or events." }, { status: 400 });
    }
    if (err instanceof BillboardConflictError) {
      return NextResponse.json({ error: "You already have a billboard live or awaiting payment." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not start billboard checkout" }, { status: 502 });
  }
}
