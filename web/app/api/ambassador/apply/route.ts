import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ pitch: z.string().max(2000).optional() });

// At most one PENDING application per user at a time (enforced here, not a
// DB constraint — same approach as VerificationApplication's own "one
// non-terminal application per type" rule). A REJECTED applicant can
// reapply freely; an APPROVED one has nothing to reapply for.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { pitch } = bodySchema.parse(await req.json().catch(() => ({})));

    if (user.isAmbassador) {
      return NextResponse.json({ error: "You're already an ambassador" }, { status: 409 });
    }
    const pending = await db.ambassadorApplication.findFirst({ where: { userId: user.id, status: "PENDING" } });
    if (pending) {
      return NextResponse.json({ error: "You already have an application pending review" }, { status: 409 });
    }

    const application = await db.ambassadorApplication.create({
      data: { userId: user.id, pitch: pitch ?? null },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
