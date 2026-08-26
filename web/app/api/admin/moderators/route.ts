import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Only manages isModerator, not isSuperModerator — granting the ability to
// grant moderator access is deliberately not exposed through this toggle
// (same reasoning as isModerator itself: the first super-moderator has to
// be set directly in the DB, not handed out through a UI).
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

const bodySchema = z.object({ handle: z.string().min(1), isModerator: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const { handle, isModerator } = bodySchema.parse(await req.json());

    const user = await db.user.findUnique({ where: { handle } });
    if (!user) return NextResponse.json({ error: "No account with that handle" }, { status: 404 });

    const updated = await db.user.update({ where: { id: user.id }, data: { isModerator } });
    return NextResponse.json({ handle: updated.handle, isModerator: updated.isModerator });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
