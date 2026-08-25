import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const EDITABLE_STATUSES = ["DRAFT", "MORE_INFO_REQUIRED"];

// Lets an applicant pull a wrong/blurry upload before submitting — the R2
// object itself is left in place (no delete API wired up for it), only the
// DB row is removed; an orphaned key is harmless since it's never listed or
// linked from anywhere once its row is gone.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, docId } = await params;

    const application = await db.verificationApplication.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!application || application.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!EDITABLE_STATUSES.includes(application.status)) {
      return NextResponse.json({ error: `Cannot remove documents from an application in status ${application.status}` }, { status: 409 });
    }

    const document = await db.verificationDocument.findUnique({ where: { id: docId } });
    if (!document || document.applicationId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.verificationDocument.delete({ where: { id: docId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
