import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getFollowingFeed } from "@/lib/discover/feed";

// v2 Discover → Following (design/v2-prototype, 2026-11-09): the newest
// releases, beats and merch from artists the signed-in user follows. A new
// endpoint — nothing existing changed. Fetched only when the Following tab
// is opened, never polled.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    return NextResponse.json(await getFollowingFeed(user.id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
