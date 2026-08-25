import { db } from "@/lib/db";
import { checkVerificationEligibility, type VerificationType } from "@/lib/verification/eligibility";

export class VerificationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// At most one non-terminal application per type per user (schema comment on
// VerificationApplication) — enforced here rather than a DB constraint,
// since Postgres partial unique indexes aren't expressible in Prisma's
// schema language without raw SQL.
const NON_TERMINAL_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "MORE_INFO_REQUIRED"] as const;
const DRAFT_EDITABLE_STATUSES = ["DRAFT", "MORE_INFO_REQUIRED"] as const;

async function writeAuditLog(
  applicationId: string,
  actorId: string,
  action:
    | "APPLICATION_CREATED"
    | "DOCUMENT_UPLOADED"
    | "APPLICATION_SUBMITTED"
    | "MOVED_UNDER_REVIEW"
    | "INFO_REQUESTED"
    | "APPLICATION_APPROVED"
    | "APPLICATION_REJECTED"
    | "VERIFICATION_SUSPENDED"
    | "VERIFICATION_REVOKED"
    | "VERIFICATION_EXPIRED",
  metadata?: Record<string, unknown>,
) {
  await db.verificationAuditLog.create({ data: { applicationId, actorId, action, metadata: metadata as never } });
}

export async function createApplication(userId: string, type: VerificationType, groupId?: string) {
  if (type === "FANBASE" && !groupId) throw new VerificationError("groupId is required for a FANBASE application");
  if (type !== "FANBASE" && groupId) throw new VerificationError("groupId is only valid for a FANBASE application");

  const existing = await db.verificationApplication.findFirst({
    where: { userId, type, status: { in: [...NON_TERMINAL_STATUSES] } },
  });
  if (existing) throw new VerificationError("You already have an application of this type in progress", 409);

  const eligibility = await checkVerificationEligibility(userId, type, groupId);
  if (!eligibility.eligible) throw new VerificationError(eligibility.reason ?? "Not eligible to apply", 403);

  const application = await db.verificationApplication.create({
    data: { userId, type, groupId: groupId ?? null },
  });
  await writeAuditLog(application.id, userId, "APPLICATION_CREATED", { type, groupId: groupId ?? null });
  return application;
}

// Fields the applicant fills in over steps 2/3/5 of the form — everything
// except type/groupId (fixed at creation) and the review/status fields
// (moderator-owned).
export type DraftInput = Partial<{
  legalFirstName: string;
  legalLastName: string;
  dateOfBirth: string; // ISO date
  country: string;
  region: string;
  phone: string;
  photoUrl: string;
  documentType: string;
  documentNumber: string;
  documentExpiresAt: string; // ISO date
  categoryData: Record<string, unknown>;
}>;

export async function updateDraft(applicationId: string, userId: string, input: DraftInput) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (application.userId !== userId) throw new VerificationError("Not your application", 403);
  if (!DRAFT_EDITABLE_STATUSES.includes(application.status as (typeof DRAFT_EDITABLE_STATUSES)[number])) {
    throw new VerificationError(`Cannot edit an application in status ${application.status}`, 409);
  }

  return db.verificationApplication.update({
    where: { id: applicationId },
    data: {
      ...input,
      categoryData: input.categoryData as never,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      documentExpiresAt: input.documentExpiresAt ? new Date(input.documentExpiresAt) : undefined,
      // Re-opening a MORE_INFO_REQUIRED draft for edits clears the
      // moderator's request text — it's served its purpose once the
      // applicant starts addressing it, and stops the old request text
      // from confusingly hanging around next to the edited answers.
      additionalInfoRequest: application.status === "MORE_INFO_REQUIRED" ? null : undefined,
    },
  });
}

// Per-type submit requirements — a judgment call (PRD §12/§18 leaves
// criteria undecided), documented in DECISIONS.md. Kept to "is there enough
// here for a reviewer to make a decision," not a precise legal checklist.
const REQUIRED_FIELDS: Record<VerificationType, (keyof DraftInput)[]> = {
  IDENTITY: ["legalFirstName", "legalLastName", "dateOfBirth", "country", "documentType", "documentNumber"],
  SELLER: ["legalFirstName", "legalLastName", "country"],
  CREATOR: ["legalFirstName", "legalLastName", "country"],
  BUSINESS: ["legalFirstName", "legalLastName", "country", "documentType", "documentNumber", "categoryData"],
  OFFICIAL: ["legalFirstName", "legalLastName", "country", "categoryData"],
  FANBASE: ["categoryData"],
};

const REQUIRED_DOCUMENTS: Partial<Record<VerificationType, string[]>> = {
  IDENTITY: ["ID_FRONT", "SELFIE"],
  BUSINESS: ["BUSINESS_REGISTRATION"],
  OFFICIAL: ["SUPPORTING_EVIDENCE"],
};

export async function submitApplication(applicationId: string, userId: string) {
  const application = await db.verificationApplication.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });
  if (!application) throw new VerificationError("Application not found", 404);
  if (application.userId !== userId) throw new VerificationError("Not your application", 403);
  if (!DRAFT_EDITABLE_STATUSES.includes(application.status as (typeof DRAFT_EDITABLE_STATUSES)[number])) {
    throw new VerificationError(`Cannot submit an application in status ${application.status}`, 409);
  }

  const type = application.type as VerificationType;
  const missing = REQUIRED_FIELDS[type].filter((field) => application[field] == null);
  if (missing.length) throw new VerificationError(`Missing required fields: ${missing.join(", ")}`);

  const requiredDocs = REQUIRED_DOCUMENTS[type] ?? [];
  const uploadedTypes = new Set(application.documents.map((d) => d.documentType));
  const missingDocs = requiredDocs.filter((d) => !uploadedTypes.has(d as never));
  if (missingDocs.length) throw new VerificationError(`Missing required documents: ${missingDocs.join(", ")}`);

  // Re-check eligibility at submit time (not just at draft creation) — an
  // applicant could sit on a draft for weeks while their standing changes.
  // The result is persisted into eligibilitySnapshot as the audit trail.
  const eligibility = await checkVerificationEligibility(userId, type, application.groupId ?? undefined);
  if (!eligibility.eligible) throw new VerificationError(eligibility.reason ?? "No longer eligible to apply", 403);

  const updated = await db.verificationApplication.update({
    where: { id: applicationId },
    data: { status: "SUBMITTED", submittedAt: new Date(), eligibilitySnapshot: eligibility as never },
  });
  await writeAuditLog(applicationId, userId, "APPLICATION_SUBMITTED");
  return updated;
}

export async function moveUnderReview(applicationId: string, moderatorId: string) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (application.status !== "SUBMITTED") throw new VerificationError(`Cannot review an application in status ${application.status}`, 409);

  const updated = await db.verificationApplication.update({
    where: { id: applicationId },
    data: { status: "UNDER_REVIEW", reviewedBy: moderatorId },
  });
  await writeAuditLog(applicationId, moderatorId, "MOVED_UNDER_REVIEW");
  return updated;
}

export async function requestMoreInfo(applicationId: string, moderatorId: string, message: string) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) {
    throw new VerificationError(`Cannot request info on an application in status ${application.status}`, 409);
  }

  const updated = await db.verificationApplication.update({
    where: { id: applicationId },
    data: { status: "MORE_INFO_REQUIRED", additionalInfoRequest: message, reviewedBy: moderatorId },
  });
  await writeAuditLog(applicationId, moderatorId, "INFO_REQUESTED", { message });
  return updated;
}

export async function rejectApplication(applicationId: string, moderatorId: string, reason: string) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (!["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_REQUIRED"].includes(application.status)) {
    throw new VerificationError(`Cannot reject an application in status ${application.status}`, 409);
  }

  const updated = await db.verificationApplication.update({
    where: { id: applicationId },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason, reviewedAt: new Date(), reviewedBy: moderatorId },
  });
  await writeAuditLog(applicationId, moderatorId, "APPLICATION_REJECTED", { reason });
  return updated;
}

// FANBASE is the one type where the applicant's requested type doesn't map
// 1:1 to a badge — the reviewer decides between OFFICIAL_FANBASE (proven
// authorization) and RECOGNIZED_COMMUNITY (a genuine community without
// proof of authorization) at approval time. Every other type maps directly.
const DEFAULT_BADGE: Partial<Record<VerificationType, string>> = {
  IDENTITY: "IDENTITY_VERIFIED",
  SELLER: "SELLER_VERIFIED",
  CREATOR: "CREATOR_VERIFIED",
  OFFICIAL: "OFFICIAL_ACCOUNT",
  BUSINESS: "TRUSTED_BUSINESS",
};

export async function approveApplication(applicationId: string, moderatorId: string, fanbaseBadge?: "OFFICIAL_FANBASE" | "RECOGNIZED_COMMUNITY") {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (!["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_REQUIRED"].includes(application.status)) {
    throw new VerificationError(`Cannot approve an application in status ${application.status}`, 409);
  }

  const type = application.type as VerificationType;
  let badge: string;
  if (type === "FANBASE") {
    if (!fanbaseBadge) throw new VerificationError("fanbaseBadge (OFFICIAL_FANBASE or RECOGNIZED_COMMUNITY) is required to approve a FANBASE application");
    badge = fanbaseBadge;
  } else {
    badge = DEFAULT_BADGE[type]!;
  }

  const now = new Date();
  // Only IDENTITY has a concrete signal to hang an expiry off of — the
  // government ID's own expiry date. The badge shouldn't outlive proof of
  // the document that justified it, so it inherits documentExpiresAt
  // verbatim. Every other type has no such signal (there's no natural
  // "seller status expires on X"), so they stay indefinite (null) until a
  // moderator explicitly suspends/revokes.
  const expiresAt = type === "IDENTITY" ? application.documentExpiresAt : null;
  const updated = await db.$transaction(async (tx) => {
    const app = await tx.verificationApplication.update({
      where: { id: applicationId },
      data: { status: "APPROVED", approvedAt: now, reviewedAt: now, reviewedBy: moderatorId, grantedBadgeType: badge as never, expiresAt },
    });

    if (type === "FANBASE") {
      await tx.fanbaseGroup.update({
        where: { id: application.groupId! },
        data: { isVerified: true, verificationBadgeType: badge as never },
      });
    } else {
      // Never unsets isVerified elsewhere (see schema comment) — approval
      // only ever adds to it, both the master flag and the specific badge.
      await tx.user.update({
        where: { id: application.userId },
        data: { isVerified: true, verificationBadges: { push: badge as never } },
      });
    }

    return app;
  });

  await writeAuditLog(applicationId, moderatorId, "APPLICATION_APPROVED", { badge });
  return updated;
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function revokeBadgeSideEffect(
  tx: TxClient,
  application: { userId: string; type: string; groupId: string | null; grantedBadgeType: string | null },
) {
  if (!application.grantedBadgeType) return;
  if (application.type === "FANBASE") {
    await tx.fanbaseGroup.update({
      where: { id: application.groupId! },
      data: { isVerified: false, verificationBadgeType: null },
    });
  } else {
    const user = await tx.user.findUniqueOrThrow({ where: { id: application.userId }, select: { verificationBadges: true } });
    await tx.user.update({
      where: { id: application.userId },
      // isVerified is deliberately left alone (see schema comment) — only
      // the specific badge granted by this application is withdrawn.
      data: { verificationBadges: user.verificationBadges.filter((b) => b !== application.grantedBadgeType) },
    });
  }
}

export async function suspendApplication(applicationId: string, moderatorId: string, reason: string) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (application.status !== "APPROVED") throw new VerificationError("Only an approved verification can be suspended", 409);

  const updated = await db.$transaction(async (tx) => {
    const app = await tx.verificationApplication.update({
      where: { id: applicationId },
      data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason },
    });
    await revokeBadgeSideEffect(tx, application);
    return app;
  });
  await writeAuditLog(applicationId, moderatorId, "VERIFICATION_SUSPENDED", { reason });
  return updated;
}

export async function revokeApplication(applicationId: string, moderatorId: string, reason: string) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new VerificationError("Application not found", 404);
  if (!["APPROVED", "SUSPENDED"].includes(application.status)) {
    throw new VerificationError("Only an approved or suspended verification can be revoked", 409);
  }

  const updated = await db.$transaction(async (tx) => {
    const app = await tx.verificationApplication.update({
      where: { id: applicationId },
      data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason },
    });
    // Already stripped at suspend time if this is a SUSPENDED -> REVOKED
    // transition — only APPROVED -> REVOKED still has a live badge to pull.
    if (application.status !== "SUSPENDED") await revokeBadgeSideEffect(tx, application);
    return app;
  });
  await writeAuditLog(applicationId, moderatorId, "VERIFICATION_REVOKED", { reason });
  return updated;
}

// System-triggered (cron), not a moderator action — see sweepExpiredVerifications
// below. Every effect mirrors revokeApplication's APPROVED branch exactly;
// only the resulting status and the audit actor differ.
async function expireApplication(applicationId: string) {
  const application = await db.verificationApplication.findUnique({ where: { id: applicationId } });
  if (!application || application.status !== "APPROVED") return;

  await db.$transaction(async (tx) => {
    await tx.verificationApplication.update({ where: { id: applicationId }, data: { status: "EXPIRED" } });
    await revokeBadgeSideEffect(tx, application);
  });
  // VerificationAuditLog.actorId is a required User FK with no system-actor
  // concept in the schema — attribute the system-triggered expiry to the
  // applicant's own row rather than adding a nullable/system-user column
  // just for this one audit entry.
  await writeAuditLog(applicationId, application.userId, "VERIFICATION_EXPIRED");
}

// PRD-adjacent judgment call, not a spec requirement: only IDENTITY badges
// ever carry an expiresAt (set at approval time in approveApplication,
// mirroring the ID document's own expiry) — every other type stays
// indefinite, so this only ever finds IDENTITY rows in practice. Called from
// the existing sweep-holds cron (see DECISIONS.md's "extending an existing
// cron" convention) rather than a new one.
export async function sweepExpiredVerifications() {
  const expired = await db.verificationApplication.findMany({
    where: { status: "APPROVED", expiresAt: { lt: new Date() } },
    select: { id: true },
  });
  for (const a of expired) await expireApplication(a.id);
  return expired.length;
}
