import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser, requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { resizeBanner } from "@/lib/images";
import { canOpenChannel, COMMUNITY_CATEGORIES, isMembershipActive } from "@/lib/communities/constants";
import { ensureDefaultChannels, getViewer, newInviteCode } from "@/lib/communities/server";

// One community (v2, design/v2-prototype): header info, channels (with the
// latest message and whether the viewer can open each), plans (with spots
// left) and the viewer's own membership / application. Public to read.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOptionalUser(req);
  const viewer = await getViewer(id, user?.id);
  if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureDefaultChannels(id);

  const [group, channels, plans, planCounts, lastPosts, joinRequest] = await Promise.all([
    db.fanbaseGroup.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        handle: true,
        name: true,
        description: true,
        coverImageUrl: true,
        bannerUrl: true,
        category: true,
        location: true,
        rules: true,
        inviteCode: true,
        isFeatured: true,
        suspendedAt: true,
        isVerified: true,
        visibility: true,
        postPermission: true,
        verificationRequestedAt: true,
        createdAt: true,
        creatorId: true,
        creator: { select: { handle: true, displayName: true, avatarUrl: true } },
        _count: { select: { memberships: true } },
      },
    }),
    db.communityChannel.findMany({ where: { groupId: id }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    db.membershipPlan.findMany({ where: { groupId: id, archivedAt: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    db.membership.groupBy({
      by: ["planId"],
      where: { groupId: id, planId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      _count: { _all: true },
    }),
    // Latest message per channel (General = null), one query.
    db.post.findMany({
      where: { groupId: id },
      orderBy: { createdAt: "desc" },
      distinct: ["channelId"],
      select: { channelId: true, body: true, imageUrl: true, createdAt: true, author: { select: { displayName: true } } },
    }),
    user ? db.joinRequest.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } }, select: { status: true, planId: true } }) : null,
  ]);
  const takenByPlan = new Map(planCounts.map((c) => [c.planId, c._count._all]));
  const lastByChannel = new Map(lastPosts.map((p) => [p.channelId ?? "general", p]));
  const m = viewer.membership;
  const preview = (key: string) => {
    const p = lastByChannel.get(key);
    return p ? { author: p.author.displayName, body: p.body || (p.imageUrl ? "📷 Photo" : ""), at: p.createdAt } : null;
  };
  // Who can see messages at all: members (and admins). Others see channel names only.
  const showPreviews = viewer.isActiveMember;

  const allChannels = [
    ...channels.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      planIds: c.planIds,
      canOpen: canOpenChannel(c, m, viewer.isOwner),
      last: showPreviews ? preview(c.id) : null,
    })),
    // The community's original chat — every member can open it.
    { id: "general", name: "General", kind: "DISCUSSION", planIds: [] as string[], canOpen: viewer.isActiveMember, last: showPreviews ? preview("general") : null },
  ];

  return NextResponse.json({
    community: {
      ...group,
      // Only admins see the invite code.
      inviteCode: viewer.isAdmin ? group.inviteCode : null,
      logoUrl: group.coverImageUrl,
      memberCount: group._count.memberships,
      isPrivate: group.visibility === "REQUEST_TO_JOIN",
    },
    channels: allChannels,
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceKobo: p.priceKobo,
      cycle: p.cycle,
      benefits: p.benefits,
      capacity: p.capacity,
      spotsLeft: p.capacity == null ? null : Math.max(0, p.capacity - (takenByPlan.get(p.id) ?? 0)),
      requiresApproval: p.requiresApproval,
    })),
    viewer: {
      signedIn: Boolean(user),
      isOwner: viewer.isOwner,
      isAdmin: viewer.isAdmin,
      membership: m
        ? { role: m.role, planId: m.planId, expiresAt: m.expiresAt, autoRenew: m.autoRenew, active: isMembershipActive(m), joinedAt: m.joinedAt }
        : null,
      joinRequest,
    },
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/, "Handle: 3–30 letters, numbers, dots or underscores")
    .nullable()
    .optional(),
  category: z.enum(COMMUNITY_CATEGORIES).nullable().optional(),
  location: z.string().trim().max(80).nullable().optional(),
  rules: z.string().trim().max(3000).nullable().optional(),
  visibility: z.enum(["OPEN", "REQUEST_TO_JOIN"]).optional(),
  // Client uploaded the original via the "avatar" presign kind; this makes the wide banner.
  bannerKey: z.string().optional(),
  removeBanner: z.boolean().optional(),
  newInviteCode: z.boolean().optional(),
});

// Community settings — the owner only (money and identity live here).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { bannerKey, removeBanner, newInviteCode: rotate, ...body } = patchSchema.parse(await req.json());
    const group = await db.fanbaseGroup.findUnique({ where: { id }, select: { creatorId: true } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (group.creatorId !== user.id) return NextResponse.json({ error: "Only the owner can change these settings" }, { status: 403 });

    if (body.handle) {
      const taken = await db.fanbaseGroup.findFirst({ where: { handle: body.handle, id: { not: id } }, select: { id: true } });
      if (taken) return NextResponse.json({ error: "That handle is taken" }, { status: 409 });
    }
    let bannerUrl: string | null | undefined;
    if (bannerKey) {
      if (!bannerKey.startsWith(`avatars/${user.id}/`)) return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
      const resized = await resizeBanner(await getObjectBuffer(bannerKey), 1500, 500);
      const derivativeKey = `avatars/${user.id}/${randomUUID()}-banner.jpg`;
      await putObjectBuffer(derivativeKey, resized, "image/jpeg");
      bannerUrl = publicUrlFor(derivativeKey);
    } else if (removeBanner) {
      bannerUrl = null;
    }

    const updated = await db.fanbaseGroup.update({
      where: { id },
      data: { ...body, ...(bannerUrl !== undefined ? { bannerUrl } : {}), ...(rotate ? { inviteCode: newInviteCode() } : {}) },
      select: { id: true, handle: true, bannerUrl: true, inviteCode: true },
    });
    return NextResponse.json({ community: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }
}
