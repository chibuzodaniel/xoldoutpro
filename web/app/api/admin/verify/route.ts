import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// PRD §12/§18: verification criteria are explicitly undecided ("who gets a
// badge, on what evidence, reviewed by whom?"). This is deliberately just a
// blunt moderator-only toggle — no criteria/evidence workflow — until that
// question gets an actual answer.
const bodySchema = z.object({ handle: z.string().min(1), verified: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    await requireModerator(req);
    const { handle, verified } = bodySchema.parse(await req.json());

    const user = await db.user.findUnique({ where: { handle } });
    if (!user) return NextResponse.json({ error: "No account with that handle" }, { status: 404 });

    const updated = await db.user.update({ where: { id: user.id }, data: { isVerified: verified } });
    return NextResponse.json({ handle: updated.handle, isVerified: updated.isVerified });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
