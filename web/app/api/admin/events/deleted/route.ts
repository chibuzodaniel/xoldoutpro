import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { listDeletedEvents } from "@/lib/commerce/eventRestore";

// Moderator "Restore event" panel search — deleted events by title or
// creator handle, newest-deleted first, with how many tickets are out there.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const q = req.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({ events: await listDeletedEvents(q) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
