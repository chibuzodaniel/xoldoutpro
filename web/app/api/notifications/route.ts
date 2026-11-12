import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Matches a notification that points at a Live (/live/<id>) — "X is live
// now" alerts and scheduled-Live reminders.
const LIVE_URL = /^\/live\/([^/?#]+)$/;

// The header bell's list. Capped at 50 since this is a recent-activity list,
// not an archive with pagination. unreadCount is what the bell badge shows:
// notifications not yet *seen* (the bell hasn't been opened since they
// arrived) — see the Notification model's seenAt/readAt comment.
//
// Live notifications carry the Live's current status (explicit ask,
// 2026-10-04): "Join live" while it's running, "Live ended" once it's over.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { countryCode: true } } } }),
      db.notification.count({ where: { userId: user.id, seenAt: null } }),
    ]);

    const liveIds = [...new Set(notifications.map((n) => n.url?.match(LIVE_URL)?.[1]).filter((id): id is string => !!id))];
    const lives = liveIds.length
      ? await db.liveSession.findMany({ where: { id: { in: liveIds } }, select: { id: true, status: true } })
      : [];
    const statusById = new Map(lives.map((l) => [l.id, l.status]));

    return NextResponse.json({
      notifications: notifications.map(({ actor, ...n }) => {
        const liveId = n.url?.match(LIVE_URL)?.[1];
        // The flag of whoever caused it (2026-11-12), when known.
        const actorCountry = actor?.countryCode ?? null;
        // A Live that no longer exists is as good as ended.
        return liveId ? { ...n, actorCountry, liveStatus: statusById.get(liveId) ?? "ENDED" } : { ...n, actorCountry };
      }),
      unreadCount,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
