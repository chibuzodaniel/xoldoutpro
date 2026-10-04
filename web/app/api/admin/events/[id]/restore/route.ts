import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { EventNotDeletedError, restoreDeletedEvent } from "@/lib/commerce/eventRestore";

// Undo a mistaken event delete — see lib/commerce/eventRestore.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModeratorPanel(req, "restoreEvent");
    const { id } = await params;
    return NextResponse.json(await restoreDeletedEvent(id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof EventNotDeletedError) return NextResponse.json({ error: "That event isn't deleted" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not restore event" }, { status: 500 });
  }
}
