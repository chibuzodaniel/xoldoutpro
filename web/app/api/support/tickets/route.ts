import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { publicUrlFor } from "@/lib/storage/r2";
import { supportRole, ticketInclude, shapeTicket, ignoredWhere, SUPPORT_KINDS } from "@/lib/support/tickets";

// XOLDOUT channel feed (2026-11-12). Views:
//   solved   — everyone: solved items (no sender shown unless it's yours)
//   mine     — your own feedback, any status
//   open / assigned / all — team only
const PAGE = 20;
const VIEWS = ["solved", "mine", "open", "assigned", "ignored", "all"] as const;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const role = await supportRole(user);
    const view = (VIEWS as readonly string[]).includes(req.nextUrl.searchParams.get("view") ?? "") ? req.nextUrl.searchParams.get("view")! : "solved";
    if ((view === "open" || view === "assigned" || view === "ignored" || view === "all") && !role.isTeam) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const before = req.nextUrl.searchParams.get("before");
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;

    const where =
      view === "solved"
        ? { status: "SOLVED" }
        : view === "mine"
          ? { authorId: user.id }
          : view === "open"
            ? { status: { not: "SOLVED" } }
            : view === "assigned"
              ? { assigneeId: user.id, status: { not: "SOLVED" } }
              : view === "ignored"
                ? ignoredWhere()
                : {};
    const rows = await db.supportTicket.findMany({
      where: { ...where, ...(beforeDate ? { updatedAt: { lt: beforeDate } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: PAGE + 1,
      include: ticketInclude,
    });
    const page = rows.slice(0, PAGE);
    const [openCount, assignedCount, ignoredCount] = role.isTeam
      ? await Promise.all([
          db.supportTicket.count({ where: { status: { not: "SOLVED" } } }),
          db.supportTicket.count({ where: { assigneeId: user.id, status: { not: "SOLVED" } } }),
          db.supportTicket.count({ where: ignoredWhere() }),
        ])
      : [0, 0, 0];
    return NextResponse.json({
      tickets: page.map((t) => shapeTicket(t, user.id, role.isTeam)).filter(Boolean),
      nextBefore: rows.length > PAGE ? page[page.length - 1].updatedAt.toISOString() : null,
      role,
      openCount,
      assignedCount,
      ignoredCount,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const createSchema = z.object({
  kind: z.enum(SUPPORT_KINDS),
  title: z.string().trim().min(3, "Give it a short title").max(120),
  body: z.string().trim().min(5, "Tell us a bit more").max(4000),
  media: z.array(z.object({ url: z.string().url().max(600), type: z.enum(["image", "video"]) })).max(4).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());
    const own = publicUrlFor(`postmedia/${user.id}/`);
    if (body.media.some((m) => !m.url.startsWith(own))) return NextResponse.json({ error: "Upload the screenshots again" }, { status: 400 });
    // One a minute is plenty; stops accidental double-sends and floods.
    const recent = await db.supportTicket.count({ where: { authorId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent > 0) return NextResponse.json({ error: "Please wait a minute before sending another" }, { status: 429 });

    const ticket = await db.supportTicket.create({ data: { authorId: user.id, ...body }, include: ticketInclude });

    // Tell the team (team members + super moderators).
    const [team, supers] = await Promise.all([
      db.supportTeamMember.findMany({ select: { userId: true } }),
      db.user.findMany({ where: { isSuperModerator: true }, select: { id: true } }),
    ]);
    const label = body.kind === "IDEA" ? "idea" : body.kind === "COMPLAINT" ? "complaint" : "issue";
    notifyUsersAfterResponse(
      [...team.map((t) => t.userId), ...supers.map((s) => s.id)].filter((id) => id !== user.id),
      { kind: "MODERATION", title: `New ${label} in XOLDOUT channel`, body: `${user.displayName}: ${body.title}`, url: `/support?t=${ticket.id}`, tag: "support-new" },
    );
    return NextResponse.json({ ticket: shapeTicket(ticket, user.id, true) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid feedback" }, { status: 400 });
    throw err;
  }
}
