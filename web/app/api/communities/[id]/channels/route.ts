import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MAX_CHANNELS } from "@/lib/communities/constants";
import { getViewer } from "@/lib/communities/server";

// Channels editor (admins). The list sent is the new order; ids kept are
// updated, new ones created, any left out removed — their messages move to
// General (Post.channelId is set to null by the database).
const channelSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["ANNOUNCEMENTS", "DISCUSSION"]),
  planIds: z.array(z.string().max(64)).max(10).default([]),
});
const bodySchema = z.object({ channels: z.array(channelSchema).max(MAX_CHANNELS) });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { channels } = bodySchema.parse(await req.json());
    const viewer = await getViewer(id, user.id);
    if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!viewer.isAdmin) return NextResponse.json({ error: "Only admins can change channels" }, { status: 403 });

    const [existing, plans] = await Promise.all([
      db.communityChannel.findMany({ where: { groupId: id }, select: { id: true } }),
      db.membershipPlan.findMany({ where: { groupId: id }, select: { id: true } }),
    ]);
    const existingIds = new Set(existing.map((c) => c.id));
    const planIds = new Set(plans.map((p) => p.id));
    const keptIds = channels.map((c) => c.id).filter((x): x is string => Boolean(x && existingIds.has(x)));

    await db.$transaction([
      db.communityChannel.deleteMany({ where: { groupId: id, id: { notIn: keptIds } } }),
      ...channels.map((c, order) => {
        const data = { name: c.name, kind: c.kind, planIds: c.planIds.filter((p) => planIds.has(p)), order };
        return c.id && existingIds.has(c.id)
          ? db.communityChannel.update({ where: { id: c.id }, data })
          : db.communityChannel.create({ data: { ...data, groupId: id } });
      }),
    ]);
    const saved = await db.communityChannel.findMany({ where: { groupId: id }, orderBy: { order: "asc" } });
    return NextResponse.json({ channels: saved });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid channels" }, { status: 400 });
    throw err;
  }
}
