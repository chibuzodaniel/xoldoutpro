import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { updateDraft, VerificationError } from "@/lib/verification/applications";
import { serializeApplication } from "@/lib/verification/serialize";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const application = await db.verificationApplication.findUnique({
      where: { id },
      include: { documents: { select: { id: true, documentType: true, status: true, uploadedAt: true } } },
    });
    if (!application || application.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ application: serializeApplication(application, { forAdmin: false }) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const patchSchema = z.object({
  legalFirstName: z.string().trim().min(1).optional(),
  legalLastName: z.string().trim().min(1).optional(),
  dateOfBirth: z.string().datetime().or(z.string().date()).optional(),
  country: z.string().trim().min(1).optional(),
  region: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  photoUrl: z.string().trim().min(1).optional(),
  documentType: z.enum(["NIN", "PASSPORT", "DRIVERS_LICENSE", "VOTERS_CARD"]).optional(),
  documentNumber: z.string().trim().min(1).optional(),
  documentExpiresAt: z.string().datetime().or(z.string().date()).optional(),
  categoryData: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const input = patchSchema.parse(await req.json());

    const updated = await updateDraft(id, user.id, input);
    return NextResponse.json({ application: serializeApplication(updated, { forAdmin: false }) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof VerificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
