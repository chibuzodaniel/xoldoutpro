import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { submitApplication, VerificationError } from "@/lib/verification/applications";
import { serializeApplication } from "@/lib/verification/serialize";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const application = await submitApplication(id, user.id);
    return NextResponse.json({ application: serializeApplication(application, { forAdmin: false }) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof VerificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
