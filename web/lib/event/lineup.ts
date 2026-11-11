import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { MAX_LINEUP, LINEUP_ROLES, LINEUP_ROLE_LABEL } from "@/lib/event/lineupRules";

// Event lineup (v2, design/v2-prototype): only XOLDOUT accounts can be added,
// shown in the organiser's order. Since 2026-11-11 each performer has a role
// (Headliner, Supporting Act, Special Guest, DJ, Artist) and gets an
// invitation to accept or decline; only ACCEPTED performers show publicly,
// and accepted events appear in the artist's profile Events list.

export { MAX_LINEUP };

export const lineupEntrySchema = z.object({ userId: z.string().min(1), role: z.enum(LINEUP_ROLES).default("ARTIST") });
export const lineupEntriesSchema = z.array(lineupEntrySchema).max(MAX_LINEUP);
/** Older clients send bare user ids. */
export const lineupSchema = z.array(z.string().min(1)).max(MAX_LINEUP);

export type LineupEntryInput = z.infer<typeof lineupEntrySchema>;

export class LineupError extends Error {}

/** Throws LineupError when an id is repeated or isn't a real account. */
export async function validateLineup(entries: { userId: string }[]) {
  const userIds = entries.map((e) => e.userId);
  if (userIds.length === 0) return;
  if (new Set(userIds).size !== userIds.length) throw new LineupError("Each person can only be in the lineup once");
  const found = await db.user.count({ where: { id: { in: userIds }, pendingGuestAt: null } });
  if (found !== userIds.length) throw new LineupError("One of the lineup accounts couldn't be found");
}

/**
 * Replaces the lineup (order = array order). People already on it keep their
 * answer; new people are invited (PENDING) — the organiser themself is
 * accepted straight away. Returns the newly invited entries.
 */
export async function setLineup(tx: Prisma.TransactionClient, eventId: string, entries: LineupEntryInput[], organiserId: string) {
  const existing = await tx.eventLineupEntry.findMany({ where: { eventId }, select: { userId: true } });
  const before = new Set(existing.map((e) => e.userId));
  await tx.eventLineupEntry.deleteMany({ where: { eventId, userId: { notIn: entries.map((e) => e.userId) } } });
  await Promise.all(
    entries.map((e, order) =>
      tx.eventLineupEntry.upsert({
        where: { eventId_userId: { eventId, userId: e.userId } },
        create: { eventId, userId: e.userId, order, role: e.role, status: e.userId === organiserId ? "ACCEPTED" : "PENDING" },
        update: { order, role: e.role },
      }),
    ),
  );
  return entries.filter((e) => !before.has(e.userId));
}

/** Invitations to perform, sent after the response. */
export function notifyLineupAdded(args: { eventId: string; title: string; organiserId: string; organiserName: string; entries: LineupEntryInput[] }) {
  // COLLABORATION is the closest existing kind (no new kinds: the mobile app
  // colours notifications by kind with no fallback).
  for (const e of args.entries) {
    if (e.userId === args.organiserId) continue;
    notifyUsersAfterResponse([e.userId], {
      kind: "COLLABORATION",
      title: "Performance invitation",
      body: `${args.organiserName} invited you to perform at "${args.title}" as ${LINEUP_ROLE_LABEL[e.role] ?? "Artist"}. Accept or decline.`,
      url: "/profile/invitations",
    });
  }
}

/** Public lineup for an event page / API: accepted performers, in order. */
export const lineupSelect = {
  where: { status: "ACCEPTED" },
  orderBy: { order: "asc" as const },
  select: { role: true, user: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } },
};

/** The organiser's own view: everyone invited, with their answer. */
export const lineupOwnerSelect = {
  orderBy: { order: "asc" as const },
  select: { role: true, status: true, user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
};
