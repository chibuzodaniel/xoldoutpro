import { NextResponse } from "next/server";
import { getWeeklyTopCreators } from "@/lib/discover/weeklyTopCreators";

// Public JSON mirror of app/(app)/discover/top-creators/page.tsx's "View
// all" list — same limit (20), for the mobile app's equivalent screen.
export async function GET() {
  const creators = await getWeeklyTopCreators(20);
  return NextResponse.json({ creators });
}
