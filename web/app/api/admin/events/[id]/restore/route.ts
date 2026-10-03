import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { EventNotDeletedError, restoreDeletedEvent } from "@/lib/commerce/eventRestore";

// Undo a mistaken event delete — see lib/commerce/eventRestore.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModerator(req);
    const { id } = await params;
    return NextResponse.json(await restoreDeletedEvent(id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof EventNotDeletedError) return NextResponse.json({ error: "That event isn't deleted" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not restore event" }, { status: 500 });
  }
}
