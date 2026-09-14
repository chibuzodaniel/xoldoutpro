import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Super-moderator-only platform toggles. Currently just the real-file-
// download feature for songs/beats — see lib/audio/serveDownload.ts's
// downloadsEnabled(), which every track/beat download route checks.
export async function GET(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
    return NextResponse.json({ downloadsEnabled: row?.downloadsEnabled ?? true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z.object({ downloadsEnabled: z.boolean() });

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireSuperModerator(req);
    const { downloadsEnabled } = patchSchema.parse(await req.json());

    const row = await db.platformSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", downloadsEnabled, updatedBy: user.id },
      update: { downloadsEnabled, updatedBy: user.id },
    });

    return NextResponse.json({ downloadsEnabled: row.downloadsEnabled });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
