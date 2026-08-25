import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeApplications } from "@/lib/verification/serialize";

// Review queue: open items (SUBMITTED/UNDER_REVIEW/MORE_INFO_REQUIRED) by
// default, oldest submission first — matches /api/reports' "open first,
// oldest first" convention. ?status=ALL or a specific status overrides.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const statusParam = req.nextUrl.searchParams.get("status");
    const where =
      statusParam === "ALL"
        ? {}
        : statusParam
          ? { status: statusParam as never }
          : { status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_REQUIRED"] as ("SUBMITTED" | "UNDER_REVIEW" | "MORE_INFO_REQUIRED")[] } };

    const applications = await db.verificationApplication.findMany({
      where,
      orderBy: { submittedAt: { sort: "asc", nulls: "last" } },
      take: 100,
      include: {
        user: { select: { handle: true, displayName: true } },
        group: { select: { id: true, name: true } },
        documents: { select: { id: true, documentType: true, status: true, uploadedAt: true } },
      },
    });

    return NextResponse.json({ applications: serializeApplications(applications, { forAdmin: true }) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
