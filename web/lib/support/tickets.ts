import { db } from "@/lib/db";
import { SUPPORT_ACCOUNT_EMAIL } from "@/lib/support/account";

// XOLDOUT channel rules (explicit ask, 2026-11-12). Enforced here for every
// route, so nobody sees more than they should by calling the API directly:
// - super admin (super moderators + the official XOLDOUT account): everything,
//   adds/removes team members, assigns;
// - team member: everything, replies, changes status;
// - everyone else: their own feedback in full (status, replies, assignee) and
//   other people's only once SOLVED — without who sent it.

export const SUPPORT_KINDS = ["ISSUE", "COMPLAINT", "IDEA"] as const;
export const SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS", "SOLVED"] as const;

type Viewer = { id: string; email: string; isSuperModerator: boolean };

/** The official account's job title, set the first time it's needed (2026-11-13). */
export const OWNER_TITLE = "CTO · Head of Engineering";

export async function supportRole(user: Viewer) {
  const isOwner = user.email.toLowerCase() === SUPPORT_ACCOUNT_EMAIL;
  const isSuper = user.isSuperModerator || isOwner;
  const team = await db.supportTeamMember.findUnique({ where: { userId: user.id }, select: { userId: true } });
  // The project's head shows up on the team with their title.
  if (isOwner && !team) {
    await db.supportTeamMember.upsert({ where: { userId: user.id }, create: { userId: user.id, addedById: user.id, title: OWNER_TITLE }, update: {} });
  }
  return { isSuper, isTeam: isSuper || Boolean(team) };
}

// supportTeam.title: the job title users see next to a team member (2026-11-13).
export const personSelect = { select: { id: true, handle: true, displayName: true, avatarUrl: true, supportTeam: { select: { title: true } } } } as const;

export const ticketInclude = {
  author: personSelect,
  assignee: personSelect,
  _count: { select: { replies: true } },
} as const;

type TicketRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  media: unknown;
  status: string;
  solvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; supportTeam: { title: string | null } | null };
  assignee: { id: string; handle: string; displayName: string; avatarUrl: string | null; supportTeam: { title: string | null } | null } | null;
  _count: { replies: number };
};

/** What this viewer may see of a ticket; null when they may not see it at all. */
export function shapeTicket(t: TicketRow, viewerId: string, isTeam: boolean) {
  const mine = t.authorId === viewerId;
  if (!isTeam && !mine && t.status !== "SOLVED") return null;
  const full = isTeam || mine;
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    body: t.body,
    media: Array.isArray(t.media) ? (t.media as { url: string; type: string }[]) : [],
    status: t.status,
    solvedAt: t.solvedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    mine,
    // Who sent it: only to them and the team.
    author: full ? t.author : null,
    assignee: t.assignee,
    replyCount: t._count.replies,
    // Team only: nothing has happened on it for a while (pick it up).
    ignored: isTeam ? isIgnored(t) : false,
  };
}

export type ShapedTicket = NonNullable<ReturnType<typeof shapeTicket>>;

// ─── Pick-up, "ignored" and reminders (explicit ask, 2026-11-12) ───────────
// An item looks ignored when nothing has happened on it for a while: assigned
// with no reply/status change for 2 days, or unassigned for 1 day. Any team
// member can pick those up; the daily job reminds people about them.
export const STALE_ASSIGNED_MS = 2 * 24 * 3600 * 1000;
export const STALE_UNASSIGNED_MS = 24 * 3600 * 1000;

export function ignoredWhere(now = Date.now()) {
  return {
    status: { not: "SOLVED" },
    OR: [
      { assigneeId: { not: null }, updatedAt: { lt: new Date(now - STALE_ASSIGNED_MS) } },
      { assigneeId: null, createdAt: { lt: new Date(now - STALE_UNASSIGNED_MS) } },
    ],
  };
}

export function isIgnored(t: { status: string; assigneeId?: string | null; assignee?: unknown; updatedAt: Date; createdAt: Date }, now = Date.now()) {
  if (t.status === "SOLVED") return false;
  const assigned = t.assigneeId != null || Boolean(t.assignee);
  return assigned ? t.updatedAt.getTime() < now - STALE_ASSIGNED_MS : t.createdAt.getTime() < now - STALE_UNASSIGNED_MS;
}

/** Daily reminders (rides the notification-reminders cron). A few grouped queries. */
export async function runSupportReminders() {
  const { notifyUsers } = await import("@/lib/notifications/create");
  const [byAssignee, ignoredByAssignee, unassignedStale, team, supers] = await Promise.all([
    db.supportTicket.groupBy({ by: ["assigneeId"], where: { status: { not: "SOLVED" }, assigneeId: { not: null } }, _count: { _all: true } }),
    db.supportTicket.groupBy({
      by: ["assigneeId"],
      where: { status: { not: "SOLVED" }, assigneeId: { not: null }, updatedAt: { lt: new Date(Date.now() - STALE_ASSIGNED_MS) } },
      _count: { _all: true },
    }),
    db.supportTicket.count({ where: { status: { not: "SOLVED" }, assigneeId: null, createdAt: { lt: new Date(Date.now() - STALE_UNASSIGNED_MS) } } }),
    db.supportTeamMember.findMany({ select: { userId: true } }),
    db.user.findMany({ where: { isSuperModerator: true }, select: { id: true } }),
  ]);
  let sent = 0;
  for (const row of byAssignee) {
    if (!row.assigneeId) continue;
    const ignored = ignoredByAssignee.find((r) => r.assigneeId === row.assigneeId)?._count._all ?? 0;
    await notifyUsers([row.assigneeId], {
      kind: "MODERATION",
      title: ignored ? `${ignored} XOLDOUT item${ignored === 1 ? "" : "s"} waiting on you` : "Your XOLDOUT items",
      body: `You have ${row._count._all} open item${row._count._all === 1 ? "" : "s"}${ignored ? `, ${ignored} with no update for 2+ days` : ""}.`,
      url: "/support?view=assigned",
      tag: "support-reminder",
    });
    sent++;
  }
  if (unassignedStale > 0) {
    const ids = [...new Set([...team.map((t) => t.userId), ...supers.map((s) => s.id)])];
    await notifyUsers(ids, {
      kind: "MODERATION",
      title: "Unpicked XOLDOUT feedback",
      body: `${unassignedStale} item${unassignedStale === 1 ? " has" : "s have"} waited over a day with nobody on it. Pick one up.`,
      url: "/support?view=ignored",
      tag: "support-unpicked",
    });
    sent += ids.length;
  }
  return { sent, unassignedStale };
}
