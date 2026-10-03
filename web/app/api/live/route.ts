import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import {
  startLiveSession,
  scheduleLiveSession,
  listLiveSessionsNow,
  listUpcomingLiveSessions,
  AlreadyLiveError,
  InvalidPinnedProductError,
  InvalidScheduleError,
} from "@/lib/live/sessions";

// Public — the "Live now" rail (Discover's Go Live tab, Socials' Live now
// rail) needs no auth, same as GET /api/events/[id]/access.
export async function GET() {
  const [sessions, upcoming] = await Promise.all([listLiveSessionsNow(), listUpcomingLiveSessions()]);
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      isPaidAccess: s.isPaidAccess,
      priceXg: s.priceXg,
      viewerCount: s.viewerCount,
      startedAt: s.startedAt,
      creator: s.creator,
    })),
    upcoming: upcoming.map((s) => ({
      id: s.id,
      title: s.title,
      scheduledFor: s.scheduledFor,
      isPaidAccess: s.isPaidAccess,
      priceXg: s.priceXg,
      reminderCount: s.reminderCount,
      creator: s.creator,
    })),
  });
}

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  coverImageLadder: z.record(z.string(), z.string()).optional(),
  isPaidAccess: z.boolean().default(false),
  priceXg: z.number().int().min(0).default(0),
  pinnedProductId: z.string().optional(),
  // Set = schedule for later (gets a shareable link now, no room until the
  // host starts it); absent = go live right away.
  scheduledFor: z.coerce.date().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = bodySchema.parse(await req.json());

    const { scheduledFor, ...details } = body;
    const session = scheduledFor
      ? await scheduleLiveSession({ creatorId: user.id, ...details, scheduledFor })
      : await startLiveSession({ creatorId: user.id, ...details });
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof AlreadyLiveError) {
      return NextResponse.json(
        { error: "You're already live", activeSession: { id: err.session.id, title: err.session.title, startedAt: err.session.startedAt } },
        { status: 409 },
      );
    }
    if (err instanceof InvalidScheduleError) {
      return NextResponse.json({ error: "Pick a time between 5 minutes and 60 days from now (max 5 upcoming Lives)." }, { status: 400 });
    }
    if (err instanceof InvalidPinnedProductError) return NextResponse.json({ error: "Invalid pinned product" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not go live" }, { status: 502 });
  }
}
