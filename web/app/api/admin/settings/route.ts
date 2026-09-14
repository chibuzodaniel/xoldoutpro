import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Super-moderator-only platform toggles: the real-file-download feature for
// songs/beats (lib/audio/serveDownload.ts's downloadsEnabled()) and the
// Billboard daily rate (lib/commerce/billboards.ts's getBillboardDailyRateKobo()).
export async function GET(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
    return NextResponse.json({
      downloadsEnabled: row?.downloadsEnabled ?? true,
      billboardDailyRateKobo: row?.billboardDailyRateKobo ?? 500_000,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  downloadsEnabled: z.boolean().optional(),
  billboardDailyRateKobo: z.number().int().positive().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireSuperModerator(req);
    const patch = patchSchema.parse(await req.json());
    if (patch.downloadsEnabled === undefined && patch.billboardDailyRateKobo === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const row = await db.platformSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        downloadsEnabled: patch.downloadsEnabled ?? true,
        billboardDailyRateKobo: patch.billboardDailyRateKobo ?? 500_000,
        updatedBy: user.id,
      },
      update: { ...patch, updatedBy: user.id },
    });

    return NextResponse.json({ downloadsEnabled: row.downloadsEnabled, billboardDailyRateKobo: row.billboardDailyRateKobo });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
