import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { getLivePublicInfo } from "@/lib/live/sessions";

// Public — what a shared /live/[id] link shows before (or instead of)
// joining: scheduled/live/ended, host, title, start time, reminder count,
// and — when signed in — whether you've asked to be reminded / are the host.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOptionalUser(req).catch(() => null);
  const live = await getLivePublicInfo(id, user?.id ?? null);
  if (!live) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ live });
}
