import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { getVisitDashboard } from "@/lib/analytics/visits";

const querySchema = z.object({
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  period: z.enum(["today", "7d", "30d", "all"]).default("30d"),
});

// Moderator dashboard "Site visits" panel (components/moderation/SiteVisitsPanel.tsx).
// ?country=NG filters every number to one country; ?period= picks the
// window for the by-country breakdown table.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const params = req.nextUrl.searchParams;
    const { country, period } = querySchema.parse({
      country: params.get("country") || null,
      period: params.get("period") ?? undefined,
    });
    return NextResponse.json(await getVisitDashboard({ country, breakdownPeriod: period }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
