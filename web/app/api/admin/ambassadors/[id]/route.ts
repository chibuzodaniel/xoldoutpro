import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generateUniqueAmbassadorCode } from "@/lib/ambassador/generateCode";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: moderator } = await requireModerator(req);
    const { id } = await params;
    const { action, rejectionReason } = bodySchema.parse(await req.json());

    const application = await db.ambassadorApplication.findUnique({ where: { id } });
    if (!application || application.status !== "PENDING") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "approve") {
      const code = await generateUniqueAmbassadorCode();
      await db.$transaction([
        db.ambassadorApplication.update({
          where: { id },
          data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: moderator.id },
        }),
        db.user.update({ where: { id: application.userId }, data: { isAmbassador: true, ambassadorCode: code } }),
      ]);
    } else {
      await db.ambassadorApplication.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedBy: moderator.id,
          rejectionReason: rejectionReason ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
