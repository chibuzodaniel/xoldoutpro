import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// People to follow (design/v2-prototype, 2026-11-09): artists with the most
// followers who have published something, excluding the viewer and anyone
// they already follow. "followsYou" marks people who already follow the
// viewer (follow-back suggestions sort first). Read once when Socials opens.
export async function GET(req: NextRequest) {
  try {
    const viewer = await getOptionalUser(req);
    const following = viewer
      ? (await db.follow.findMany({ where: { followerId: viewer.id }, select: { followedId: true }, take: 2000 })).map((f) => f.followedId)
      : [];
    const exclude = viewer ? [viewer.id, ...following] : [];

    const [popular, followers] = await Promise.all([
      db.user.findMany({
        where: {
          id: exclude.length ? { notIn: exclude } : undefined,
          pendingGuestAt: null,
          deletedAt: null,
          products: { some: { status: "PUBLISHED" } },
        },
        orderBy: { followers: { _count: "desc" } },
        take: 12,
        select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true, tags: true, _count: { select: { followers: true } } },
      }),
      viewer
        ? db.follow.findMany({
            where: { followedId: viewer.id, followerId: { notIn: exclude } },
            orderBy: { createdAt: "desc" },
            take: 6,
            select: {
              follower: {
                select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true, tags: true, _count: { select: { followers: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const followBack = followers.map((f) => f.follower).filter((u) => u.handle);
    const seen = new Set<string>();
    const people = [...followBack.map((u) => ({ ...u, followsYou: true })), ...popular.map((u) => ({ ...u, followsYou: false }))]
      .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
      .slice(0, 12)
      .map((u) => ({
        id: u.id,
        handle: u.handle,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isVerified: u.isVerified,
        verificationBadges: u.verificationBadges,
        role: u.tags[0] ?? null,
        followers: u._count.followers,
        followsYou: u.followsYou,
      }));

    return NextResponse.json({ people });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
