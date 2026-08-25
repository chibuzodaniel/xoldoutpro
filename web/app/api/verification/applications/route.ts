import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createApplication, VerificationError } from "@/lib/verification/applications";
import { serializeApplications } from "@/lib/verification/serialize";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const applications = await db.verificationApplication.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { documents: { select: { id: true, documentType: true, status: true, uploadedAt: true } } },
    });
    return NextResponse.json({ applications: serializeApplications(applications, { forAdmin: false }) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const createSchema = z.object({
  type: z.enum(["IDENTITY", "SELLER", "CREATOR", "OFFICIAL", "BUSINESS", "FANBASE"]),
  groupId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { type, groupId } = createSchema.parse(await req.json());

    const application = await createApplication(user.id, type, groupId);
    return NextResponse.json({ application: serializeApplications([application], { forAdmin: false })[0] }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof VerificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
