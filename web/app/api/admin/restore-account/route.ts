import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// The moderator-only escape hatch once a self-service recovery window (see
// /api/account/recover) has closed — no deadline check here, a moderator can
// restore a deleted account at any point after that.
const bodySchema = z.object({ handle: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    await requireModerator(req);
    const { handle } = bodySchema.parse(await req.json());

    const user = await db.user.findUnique({ where: { handle } });
    if (!user) return NextResponse.json({ error: "No account with that handle" }, { status: 404 });
    if (!user.deletedAt) return NextResponse.json({ error: "That account isn't deleted" }, { status: 400 });

    const restored = await db.user.update({ where: { id: user.id }, data: { deletedAt: null } });
    return NextResponse.json({ handle: restored.handle, deletedAt: restored.deletedAt });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
