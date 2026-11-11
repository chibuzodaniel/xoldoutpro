import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSuperModerator } from "@/lib/auth/session";
import { getDeletedSnapshot } from "@/lib/moderation/deletedContent";

// The archived copy of one deleted item, for the panel's "View".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperModerator(req);
    const { id } = await params;
    const snapshot = await getDeletedSnapshot(id);
    if (!snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
