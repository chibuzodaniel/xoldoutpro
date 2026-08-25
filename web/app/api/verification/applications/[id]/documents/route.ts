import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignUpload, presignDownload } from "@/lib/storage/r2";

// Content types accepted per document type — BUSINESS_REGISTRATION is the
// only one that's commonly a PDF (a certificate of incorporation), not a photo.
const CONTENT_TYPES: Record<string, string[]> = {
  ID_FRONT: ["image/jpeg", "image/png"],
  ID_BACK: ["image/jpeg", "image/png"],
  SELFIE: ["image/jpeg", "image/png"],
  PROOF_OF_ADDRESS: ["image/jpeg", "image/png", "application/pdf"],
  BUSINESS_REGISTRATION: ["image/jpeg", "image/png", "application/pdf"],
  SUPPORTING_EVIDENCE: ["image/jpeg", "image/png", "application/pdf"],
};
const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

const EDITABLE_STATUSES = ["DRAFT", "MORE_INFO_REQUIRED"];

// GET: owner-only list with short-TTL signed view URLs (never the raw
// storageKey — see the model comment on VerificationDocument).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const application = await db.verificationApplication.findUnique({ where: { id }, select: { userId: true } });
    if (!application || application.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const documents = await db.verificationDocument.findMany({ where: { applicationId: id }, orderBy: { uploadedAt: "asc" } });
    const withUrls = await Promise.all(
      documents.map(async (d) => ({
        id: d.id,
        documentType: d.documentType,
        status: d.status,
        uploadedAt: d.uploadedAt,
        viewUrl: await presignDownload(d.storageKey),
      })),
    );
    return NextResponse.json({ documents: withUrls });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const postSchema = z.object({
  documentType: z.enum(["ID_FRONT", "ID_BACK", "SELFIE", "PROOF_OF_ADDRESS", "BUSINESS_REGISTRATION", "SUPPORTING_EVIDENCE"]),
  contentType: z.string(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { documentType, contentType } = postSchema.parse(await req.json());

    const application = await db.verificationApplication.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!application || application.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!EDITABLE_STATUSES.includes(application.status)) {
      return NextResponse.json({ error: `Cannot add documents to an application in status ${application.status}` }, { status: 409 });
    }

    if (!CONTENT_TYPES[documentType].includes(contentType)) {
      return NextResponse.json({ error: `Unsupported content-type for ${documentType}: ${contentType}` }, { status: 400 });
    }

    // Namespaced under the applicant's id and this application, never under
    // a public prefix — resolved only via presignDownload, never publicUrlFor.
    const key = `verification/${user.id}/${id}/${documentType}/${randomUUID()}.${EXT_BY_TYPE[contentType]}`;
    const uploadUrl = await presignUpload(key, contentType);
    const document = await db.verificationDocument.create({ data: { applicationId: id, documentType, storageKey: key } });

    await db.verificationAuditLog.create({
      data: { applicationId: id, actorId: user.id, action: "DOCUMENT_UPLOADED", metadata: { documentType } },
    });

    return NextResponse.json({ documentId: document.id, uploadUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
