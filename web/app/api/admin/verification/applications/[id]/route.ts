import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/storage/r2";
import { serializeApplication } from "@/lib/verification/serialize";
import {
  approveApplication,
  moveUnderReview,
  rejectApplication,
  requestMoreInfo,
  revokeApplication,
  suspendApplication,
  VerificationError,
} from "@/lib/verification/applications";
import { sendPushToUser } from "@/lib/push/send";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModerator(req);
    const { id } = await params;

    const application = await db.verificationApplication.findUnique({
      where: { id },
      include: {
        user: { select: { handle: true, displayName: true } },
        group: { select: { id: true, name: true } },
        reviewer: { select: { handle: true, displayName: true } },
        documents: true,
        auditLogs: { orderBy: { createdAt: "asc" }, include: { actor: { select: { handle: true, displayName: true } } } },
      },
    });
    if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const documents = await Promise.all(
      application.documents.map(async (d) => ({
        id: d.id,
        documentType: d.documentType,
        status: d.status,
        uploadedAt: d.uploadedAt,
        viewUrl: await presignDownload(d.storageKey),
      })),
    );

    return NextResponse.json({ application: { ...serializeApplication(application, { forAdmin: true }), documents } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("under_review") }),
  z.object({ action: z.literal("request_info"), message: z.string().trim().min(1) }),
  z.object({ action: z.literal("approve"), fanbaseBadge: z.enum(["OFFICIAL_FANBASE", "RECOGNIZED_COMMUNITY"]).optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1) }),
  z.object({ action: z.literal("suspend"), reason: z.string().trim().min(1) }),
  z.object({ action: z.literal("revoke"), reason: z.string().trim().min(1) }),
]);

const NOTIFICATION_COPY: Record<string, { title: string; body: string }> = {
  request_info: { title: "More information needed", body: "A moderator requested more information on your verification application." },
  approve: { title: "Verification approved", body: "Your verification application was approved." },
  reject: { title: "Verification application rejected", body: "Your verification application was not approved." },
  suspend: { title: "Verification suspended", body: "Your verification badge has been suspended." },
  revoke: { title: "Verification revoked", body: "Your verification badge has been revoked." },
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: moderator } = await requireModerator(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const application =
      body.action === "under_review"
        ? await moveUnderReview(id, moderator.id)
        : body.action === "request_info"
          ? await requestMoreInfo(id, moderator.id, body.message)
          : body.action === "approve"
            ? await approveApplication(id, moderator.id, body.fanbaseBadge)
            : body.action === "reject"
              ? await rejectApplication(id, moderator.id, body.reason)
              : body.action === "suspend"
                ? await suspendApplication(id, moderator.id, body.reason)
                : await revokeApplication(id, moderator.id, body.reason);

    const copy = NOTIFICATION_COPY[body.action];
    if (copy) sendPushToUser(application.userId, { ...copy, url: "/verification" });

    return NextResponse.json({ application: serializeApplication(application, { forAdmin: true }) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof VerificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
