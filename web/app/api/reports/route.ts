import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// PRD §14: inappropriate content and copyright claims are time-critical and
// SLA-backed; bug reports and feature requests are not.
const SLA_HOURS: Partial<Record<string, number>> = {
  INAPPROPRIATE_CONTENT: 24,
  COPYRIGHT_CLAIM: 24,
};

const createSchema = z.object({
  targetType: z.enum(["PRODUCT", "EVENT", "POST", "PROFILE"]),
  targetId: z.string().min(1),
  reason: z.enum(["INAPPROPRIATE_CONTENT", "COPYRIGHT_CLAIM", "BUG", "FEATURE_REQUEST"]),
  details: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { targetType, targetId, reason, details } = createSchema.parse(await req.json());

    // In-context reporting (PRD §14): available as an action on any release,
    // event, post, or profile. Verify the target exists before filing.
    if (targetType === "PRODUCT") {
      const product = await db.product.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (targetType === "EVENT") {
      const event = await db.event.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (targetType === "POST") {
      const post = await db.post.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else {
      // Self-targeting a PROFILE is how general app feedback (bug/feature
      // request) is filed — there's no dedicated "app" target type, and PRD
      // §14 doesn't need one since those two reasons aren't content moderation.
      // Content-moderation reasons still can't target your own profile.
      const isGeneralFeedback = reason === "BUG" || reason === "FEATURE_REQUEST";
      if (targetId === user.id && !isGeneralFeedback) {
        return NextResponse.json({ error: "Cannot report your own profile" }, { status: 400 });
      }
      const profile = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const slaHours = SLA_HOURS[reason];
    const report = await db.report.create({
      data: {
        reporterId: user.id,
        targetType,
        productId: targetType === "PRODUCT" ? targetId : null,
        eventId: targetType === "EVENT" ? targetId : null,
        postId: targetType === "POST" ? targetId : null,
        profileId: targetType === "PROFILE" ? targetId : null,
        reason,
        details: details || null,
        slaDueAt: slaHours ? new Date(Date.now() + slaHours * 60 * 60 * 1000) : null,
      },
    });

    return NextResponse.json({ report: { id: report.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}

// Moderation queue (PRD §14): internal staff only. Open items first, ranked
// by SLA urgency (soonest due first, no-SLA items last), then oldest first.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const statusParam = req.nextUrl.searchParams.get("status");
    const where =
      statusParam === "RESOLVED"
        ? { status: "RESOLVED" as const }
        : statusParam === "ALL"
          ? {}
          : { status: { in: ["OPEN", "IN_REVIEW"] as ("OPEN" | "IN_REVIEW")[] } };

    const reports = await db.report.findMany({
      where,
      orderBy: [{ slaDueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 100,
      include: {
        reporter: { select: { handle: true, displayName: true } },
        product: { select: { id: true, title: true, type: true, creator: { select: { handle: true, displayName: true } } } },
        event: { select: { id: true, title: true, creator: { select: { handle: true, displayName: true } } } },
        post: { select: { id: true, body: true, author: { select: { handle: true, displayName: true } } } },
        profile: { select: { id: true, handle: true, displayName: true } },
      },
    });

    return NextResponse.json({ reports });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
