import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ action: z.enum(["approve", "reject"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, requestId } = await params;
    const { action } = bodySchema.parse(await req.json());

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (membership?.role !== "ADMIN") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const request = await db.joinRequest.findUnique({ where: { id: requestId } });
    if (!request || request.groupId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (request.status !== "PENDING") return NextResponse.json({ error: "Already resolved" }, { status: 409 });

    if (action === "approve") {
      await db.$transaction([
        db.joinRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } }),
        db.membership.upsert({
          where: { groupId_userId: { groupId: id, userId: request.userId } },
          update: {},
          create: { groupId: id, userId: request.userId, role: "MEMBER" },
        }),
      ]);
    } else {
      await db.joinRequest.update({ where: { id: requestId }, data: { status: "REJECTED" } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
