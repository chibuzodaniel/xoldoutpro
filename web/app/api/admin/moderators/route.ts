import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Manages both isModerator and (explicit ask) isSuperModerator — the very
// first super-moderator still has to be set directly in the DB (same
// bootstrapping reasoning as isModerator itself), but from there on an
// existing super-moderator can promote/demote other moderators through
// this panel.
export async function GET(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const moderators = await db.user.findMany({
      where: { isModerator: true },
      // email deliberately excluded — moderators managing this list only
      // need name/handle/Super status, not each other's contact info.
      select: { id: true, handle: true, displayName: true, isSuperModerator: true },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json({ moderators });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const bodySchema = z.object({
  handle: z.string().min(1),
  isModerator: z.boolean().optional(),
  isSuperModerator: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const { handle, isModerator, isSuperModerator } = bodySchema.parse(await req.json());
    if (isModerator === undefined && isSuperModerator === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { handle } });
    if (!user) return NextResponse.json({ error: "No account with that handle" }, { status: 404 });

    // Can't demote the only remaining super-moderator — that would leave no
    // one able to manage moderators (including un-demoting themselves).
    if ((isSuperModerator === false || isModerator === false) && user.isSuperModerator) {
      const otherSupers = await db.user.count({ where: { isSuperModerator: true, id: { not: user.id } } });
      if (otherSupers === 0) {
        return NextResponse.json({ error: "Can't remove the last super-moderator" }, { status: 400 });
      }
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(isModerator !== undefined ? { isModerator } : {}),
        // Revoking moderator access revokes super-moderator status with it —
        // a non-moderator can't stay a super-moderator.
        ...(isSuperModerator !== undefined ? { isSuperModerator } : isModerator === false ? { isSuperModerator: false } : {}),
      },
    });
    return NextResponse.json({ handle: updated.handle, isModerator: updated.isModerator, isSuperModerator: updated.isSuperModerator });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
