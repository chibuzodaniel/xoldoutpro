import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { createCoinTopUpCheckout, InvalidTopUpPackError, XG_TOPUP_PACKS } from "@/lib/live/coins";

export async function GET() {
  return NextResponse.json({ packs: XG_TOPUP_PACKS });
}

const bodySchema = z.object({ packIndex: z.number().int().min(0).max(XG_TOPUP_PACKS.length - 1) });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { packIndex } = bodySchema.parse(await req.json());

    const result = await createCoinTopUpCheckout({
      userId: user.id,
      packIndex,
      origin: req.nextUrl.origin,
      customerEmail: user.email,
      customerName: user.displayName,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof InvalidTopUpPackError) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}
