import { db } from "@/lib/db";
import { isMembershipActive } from "@/lib/communities/constants";

// Server-side helpers shared by the community API routes.

export async function getViewer(groupId: string, userId: string | null | undefined) {
  const group = await db.fanbaseGroup.findUnique({ where: { id: groupId }, select: { id: true, creatorId: true, name: true, postPermission: true, visibility: true, suspendedAt: true } });
  if (!group) return null;
  const membership = userId ? await db.membership.findUnique({ where: { groupId_userId: { groupId, userId } } }) : null;
  const isOwner = Boolean(userId && group.creatorId === userId);
  const isAdmin = isOwner || membership?.role === "ADMIN";
  return { group, membership, isOwner, isAdmin, isActiveMember: isAdmin || isMembershipActive(membership) };
}

/** Every community has an Announcements channel; made the first time it's needed. */
export async function ensureDefaultChannels(groupId: string) {
  const count = await db.communityChannel.count({ where: { groupId } });
  if (count === 0) {
    await db.communityChannel.create({ data: { groupId, name: "Announcements", kind: "ANNOUNCEMENTS", order: 0 } });
  }
}

/** Random, readable invite code (no 0/O/1/I). */
export function newInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
