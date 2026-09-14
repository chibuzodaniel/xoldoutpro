import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Which moderation-dashboard panels a *regular* moderator sees — see the
// ModerationPanelVisibility model's own comment. Keys here must match
// PANEL_KEYS in app/(app)/moderation/page.tsx.
const PANEL_KEYS = [
  "finance",
  "stats",
  "users",
  "ambassadors",
  "verifyCreator",
  "verifyGroup",
  "verificationQueue",
  "restoreAccount",
] as const;

// GET is any moderator (the moderation page itself needs this to know what
// to render for the current viewer, super or not) — PATCH is super-mod
// only, same as everything else that controls what other moderators see.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const rows = await db.moderationPanelVisibility.findMany();
    const byKey = new Map(rows.map((r) => [r.panelKey, r.visible]));
    const visibility = Object.fromEntries(PANEL_KEYS.map((k) => [k, byKey.get(k) ?? true]));
    return NextResponse.json({ visibility });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  panelKey: z.enum(PANEL_KEYS),
  visible: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireSuperModerator(req);
    const { panelKey, visible } = patchSchema.parse(await req.json());

    const row = await db.moderationPanelVisibility.upsert({
      where: { panelKey },
      create: { panelKey, visible, updatedBy: user.id },
      update: { visible, updatedBy: user.id },
    });

    return NextResponse.json({ panelKey: row.panelKey, visible: row.visible });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
