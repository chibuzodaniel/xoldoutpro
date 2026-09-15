import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Super-moderator-only platform toggles: the real-file-download feature for
// songs/beats (lib/audio/serveDownload.ts's downloadsEnabled()) and the
// Billboard daily rate (lib/commerce/billboards.ts's getBillboardDailyRateKobo()).
function serialize(row: { downloadsEnabled: boolean; billboardDailyRateKobo: number; commissionReleasePercent: number; commissionBeatPercent: number; commissionMerchPercent: number; commissionEventPercent: number } | null) {
  return {
    downloadsEnabled: row?.downloadsEnabled ?? true,
    billboardDailyRateKobo: row?.billboardDailyRateKobo ?? 500_000,
    commissionReleasePercent: row?.commissionReleasePercent ?? 12,
    commissionBeatPercent: row?.commissionBeatPercent ?? 12,
    commissionMerchPercent: row?.commissionMerchPercent ?? 12,
    commissionEventPercent: row?.commissionEventPercent ?? 5,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
    return NextResponse.json(serialize(row));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Commission rates capped at 90% (same ceiling EventPromoter's own
// sharePercent uses) — a moderator fat-fingering 100 would leave sellers
// with nothing, and there's no legitimate reason to go that high.
const patchSchema = z.object({
  downloadsEnabled: z.boolean().optional(),
  billboardDailyRateKobo: z.number().int().positive().optional(),
  commissionReleasePercent: z.number().int().min(0).max(90).optional(),
  commissionBeatPercent: z.number().int().min(0).max(90).optional(),
  commissionMerchPercent: z.number().int().min(0).max(90).optional(),
  commissionEventPercent: z.number().int().min(0).max(90).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireSuperModerator(req);
    const patch = patchSchema.parse(await req.json());
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const row = await db.platformSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        downloadsEnabled: patch.downloadsEnabled ?? true,
        billboardDailyRateKobo: patch.billboardDailyRateKobo ?? 500_000,
        commissionReleasePercent: patch.commissionReleasePercent ?? 12,
        commissionBeatPercent: patch.commissionBeatPercent ?? 12,
        commissionMerchPercent: patch.commissionMerchPercent ?? 12,
        commissionEventPercent: patch.commissionEventPercent ?? 5,
        updatedBy: user.id,
      },
      update: { ...patch, updatedBy: user.id },
    });

    return NextResponse.json(serialize(row));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
