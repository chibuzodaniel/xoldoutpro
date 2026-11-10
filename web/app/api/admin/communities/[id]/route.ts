import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

// Feature / unfeature, suspend / restore a community (moderators).
const bodySchema = z.object({ featured: z.boolean().optional(), suspended: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModeratorPanel(req, "communities");
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    const group = await db.fanbaseGroup.findUnique({ where: { id }, select: { creatorId: true, name: true, suspendedAt: true } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await db.fanbaseGroup.update({
      where: { id },
      data: {
        ...(body.featured !== undefined ? { isFeatured: body.featured } : {}),
        ...(body.suspended !== undefined ? { suspendedAt: body.suspended ? (group.suspendedAt ?? new Date()) : null } : {}),
      },
      select: { id: true, isFeatured: true, suspendedAt: true },
    });
    if (body.suspended !== undefined && Boolean(group.suspendedAt) !== body.suspended) {
      if (body.suspended) {
        await db.report.updateMany({ where: { groupId: id, status: { not: "RESOLVED" } }, data: { status: "RESOLVED" } });
      }
      notifyUsersAfterResponse([group.creatorId], {
        kind: "MODERATION",
        title: body.suspended ? "Community suspended" : "Community restored",
        body: body.suspended
          ? `${group.name} was suspended by XOLDOUT. Contact support if you think this is a mistake.`
          : `${group.name} is active again.`,
        url: `/groups/${id}`,
      });
    }
    return NextResponse.json({ community: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    throw err;
  }
}
