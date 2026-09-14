import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { approveBillboard, rejectBillboard, BillboardStateError } from "@/lib/commerce/billboards";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]).optional(),
  rejectionReason: z.string().min(1).max(500).optional(),
  extendDays: z.number().int().positive().max(365).optional(),
  status: z.enum(["ACTIVE", "REMOVED"]).optional(),
});

// Moderator review queue (approve/reject a PENDING_REVIEW billboard — reject
// always refunds, see lib/commerce/billboards.ts's rejectBillboard) plus the
// existing "override the time"/remove controls for an already-live one.
// Moderator, not super-mod — same trust tier as a takedown.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireModerator(req);
    const { id } = await params;
    const { action, rejectionReason, extendDays, status } = bodySchema.parse(await req.json());

    if (action === "approve") {
      const billboard = await approveBillboard(id, user.id);
      return NextResponse.json({ billboard });
    }
    if (action === "reject") {
      if (!rejectionReason) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
      const billboard = await rejectBillboard(id, user.id, rejectionReason);
      return NextResponse.json({ billboard });
    }

    const billboard = await db.billboard.findUnique({ where: { id } });
    if (!billboard) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: { expiresAt?: Date; status?: "ACTIVE" | "REMOVED"; activatedAt?: Date; updatedBy: string } = {
      updatedBy: user.id,
    };
    if (extendDays) {
      const base = billboard.expiresAt && billboard.expiresAt > new Date() ? billboard.expiresAt : new Date();
      data.expiresAt = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);
      if (billboard.status !== "ACTIVE") {
        data.status = "ACTIVE";
        data.activatedAt = new Date();
      }
    }
    if (status) data.status = status;

    const updated = await db.billboard.update({ where: { id }, data });
    return NextResponse.json({ billboard: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof BillboardStateError) {
      return NextResponse.json({ error: "This billboard isn't awaiting review." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
