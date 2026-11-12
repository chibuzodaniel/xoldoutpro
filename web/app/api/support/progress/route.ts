import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { supportRole, personSelect, ignoredWhere, STALE_ASSIGNED_MS } from "@/lib/support/tickets";

// Super admin: how the team is doing (2026-11-12). A few grouped queries.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    if (!(await supportRole(user)).isSuper) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const now = Date.now();
    const d7 = new Date(now - 7 * 864e5);
    const d30 = new Date(now - 30 * 864e5);
    const [open, unassigned, inProgress, ignored, solved7, members, supers, openBy, staleBy, solvedBy7, solved30Rows] = await Promise.all([
      db.supportTicket.count({ where: { status: { not: "SOLVED" } } }),
      db.supportTicket.count({ where: { status: { not: "SOLVED" }, assigneeId: null } }),
      db.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
      db.supportTicket.count({ where: ignoredWhere(now) }),
      db.supportTicket.count({ where: { status: "SOLVED", solvedAt: { gte: d7 } } }),
      db.supportTeamMember.findMany({ select: { user: personSelect } }),
      db.user.findMany({ where: { isSuperModerator: true }, select: personSelect.select }),
      db.supportTicket.groupBy({ by: ["assigneeId"], where: { status: { not: "SOLVED" }, assigneeId: { not: null } }, _count: { _all: true } }),
      db.supportTicket.groupBy({ by: ["assigneeId"], where: { status: { not: "SOLVED" }, assigneeId: { not: null }, updatedAt: { lt: new Date(now - STALE_ASSIGNED_MS) } }, _count: { _all: true } }),
      db.supportTicket.groupBy({ by: ["assigneeId"], where: { status: "SOLVED", solvedAt: { gte: d7 }, assigneeId: { not: null } }, _count: { _all: true } }),
      db.supportTicket.findMany({ where: { status: "SOLVED", solvedAt: { gte: d30 }, assigneeId: { not: null } }, select: { assigneeId: true, createdAt: true, solvedAt: true } }),
    ]);
    type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null; role: string };
    const people = new Map<string, Person>();
    for (const s of supers) people.set(s.id, { ...s, role: "Super admin" });
    for (const m of members) if (!people.has(m.user.id)) people.set(m.user.id, { ...m.user, role: "Team" });
    const pick = (rows: { assigneeId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.assigneeId === id)?._count._all ?? 0;
    const rows = [...people.values()].map((p) => {
      const solved30 = solved30Rows.filter((r) => r.assigneeId === p.id);
      const avgHours = solved30.length ? Math.round(solved30.reduce((n, r) => n + (r.solvedAt!.getTime() - r.createdAt.getTime()), 0) / solved30.length / 36e5) : null;
      return { person: p, open: pick(openBy, p.id), ignored: pick(staleBy, p.id), solved7: pick(solvedBy7, p.id), solved30: solved30.length, avgSolveHours: avgHours };
    });
    rows.sort((a, b) => b.ignored - a.ignored || b.open - a.open);
    return NextResponse.json({ totals: { open, unassigned, inProgress, ignored, solved7 }, members: rows });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
