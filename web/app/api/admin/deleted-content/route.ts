import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireSuperModerator } from "@/lib/auth/session";
import { DELETED_FILTERS, listDeleted, restoreDeleted, restoreDeletedProduct, RestoreError } from "@/lib/moderation/deletedContent";
import { EventNotDeletedError, restoreDeletedEvent } from "@/lib/commerce/eventRestore";

// "Deleted content" panel (super moderators only — explicit ask, 2026-11-11).
export async function GET(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const sp = req.nextUrl.searchParams;
    const filter = z.enum(DELETED_FILTERS).catch("ALL").parse(sp.get("kind") ?? "ALL");
    const beforeRaw = sp.get("before");
    const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : null;
    return NextResponse.json(await listDeleted({ filter, q: sp.get("q") ?? "", before }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const restoreSchema = z.object({ source: z.enum(["ARCHIVE", "PRODUCT", "EVENT"]), id: z.string().min(1).max(64) });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireSuperModerator(req);
    const { source, id } = restoreSchema.parse(await req.json());
    if (source === "ARCHIVE") return NextResponse.json(await restoreDeleted(id, user.id));
    if (source === "PRODUCT") return NextResponse.json(await restoreDeletedProduct(id));
    return NextResponse.json(await restoreDeletedEvent(id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof RestoreError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof EventNotDeletedError) return NextResponse.json({ error: "That event isn't deleted" }, { status: 409 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not restore" }, { status: 500 });
  }
}
