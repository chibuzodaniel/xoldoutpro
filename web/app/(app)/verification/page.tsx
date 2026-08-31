"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { uploadVerificationDocument } from "@/lib/uploadVerificationDocument";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { BackHeader } from "@/components/ui/BackHeader";

type VerificationType = "IDENTITY" | "SELLER" | "CREATOR" | "OFFICIAL" | "BUSINESS" | "FANBASE";
type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFO_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "REVOKED"
  | "EXPIRED";

type Application = {
  id: string;
  type: VerificationType;
  status: ApplicationStatus;
  groupId: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  dateOfBirth: string | null;
  country: string | null;
  region: string | null;
  phone: string | null;
  documentType: string | null;
  documentExpiresAt: string | null;
  categoryData: { notes?: string } | null;
  rejectionReason: string | null;
  additionalInfoRequest: string | null;
  grantedBadgeType: string | null;
  documents: { id: string; documentType: string; status: string; uploadedAt: string }[];
};

type OwnedGroup = { id: string; name: string; creatorId: string };

const EDITABLE_STATUSES: ApplicationStatus[] = ["DRAFT", "MORE_INFO_REQUIRED"];

const TYPE_META: Record<VerificationType, { label: string; description: string }> = {
  IDENTITY: { label: "Identity", description: "Prove you're a real person with a government ID." },
  SELLER: { label: "Seller", description: "Confirm you're an active seller on XOLDOUT." },
  CREATOR: { label: "Creator", description: "For active music and beat creators." },
  OFFICIAL: { label: "Official account", description: "For public figures and organizations." },
  BUSINESS: { label: "Business", description: "For a registered business selling on XOLDOUT." },
  FANBASE: { label: "Fanbase group", description: "Verify a Fanbase group you run." },
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  MORE_INFO_REQUIRED: "More info needed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
};

// Mirrors lib/verification/applications.ts's REQUIRED_DOCUMENTS — duplicated
// here for UX only (which uploaders to show); the server is the actual
// source of truth and re-validates on submit.
const DOCUMENT_SLOTS: Partial<Record<VerificationType, { type: string; label: string; required: boolean }[]>> = {
  IDENTITY: [
    { type: "ID_FRONT", label: "Government ID (front)", required: true },
    { type: "ID_BACK", label: "Government ID (back)", required: false },
    { type: "SELFIE", label: "Selfie holding your ID", required: true },
  ],
  BUSINESS: [{ type: "BUSINESS_REGISTRATION", label: "Business registration document", required: true }],
  OFFICIAL: [{ type: "SUPPORTING_EVIDENCE", label: "Proof of public-figure status", required: true }],
  FANBASE: [{ type: "SUPPORTING_EVIDENCE", label: "Evidence of authorization (optional)", required: false }],
};

export default function VerificationPage() {
  const { appUser, loading: authLoading } = useAuth();
  const toast = useToast();

  const [applications, setApplications] = useState<Application[] | null>(null);
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/verification/applications");
    if (!res.ok) return setApplications([]);
    const data: { applications: Application[] } = await res.json();
    setApplications(data.applications);
  }, []);

  useEffect(() => {
    if (!appUser) return;
    const userId = appUser.id;
    async function initialLoad() {
      const res = await apiFetch("/api/verification/applications");
      if (!res.ok) return setApplications([]);
      const data: { applications: Application[] } = await res.json();
      setApplications(data.applications);
    }
    initialLoad();

    async function loadGroups() {
      const r = await apiFetch("/api/groups");
      if (!r.ok) return;
      const data: { groups: OwnedGroup[] } = await r.json();
      setOwnedGroups(data.groups.filter((g) => g.creatorId === userId));
    }
    loadGroups();
  }, [appUser]);

  async function startApplication(type: VerificationType, groupId?: string) {
    try {
      const res = await apiFetch("/api/verification/applications", {
        method: "POST",
        body: JSON.stringify({ type, groupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not start application");
      setPicking(false);
      await load();
      setEditingId(data.application.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (authLoading || applications === null) return <LoadingSpinner full size="lg" />;
  if (!appUser) return null;

  const editing = applications.find((a) => a.id === editingId) ?? null;
  if (editing) {
    return (
      <ApplicationForm
        application={editing}
        onBack={() => setEditingId(null)}
        onChange={(updated) => setApplications((cur) => (cur ?? []).map((a) => (a.id === updated.id ? updated : a)))}
      />
    );
  }

  const nonTerminalTypes = new Set(
    applications.filter((a) => a.status !== "REJECTED" && a.status !== "REVOKED" && a.status !== "EXPIRED").map((a) => a.type),
  );
  const availableTypes = (Object.keys(TYPE_META) as VerificationType[]).filter((t) => !nonTerminalTypes.has(t));

  return (
    <div className="pb-24">
      <BackHeader title="Get Verified" />
      <div className="px-4 max-w-lg mx-auto">
      <p className="text-xs text-ink-3 mb-6">
        Apply for a verification badge. Criteria vary by badge type; every application is reviewed by a moderator.
      </p>

      {applications.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {applications.map((a) => (
            <div key={a.id} className="rounded-lg border border-line-soft p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  {TYPE_META[a.type].label}
                  {a.grantedBadgeType && a.status === "APPROVED" && <VerifiedBadge badgeType={a.grantedBadgeType} />}
                </p>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-2">
                  {STATUS_LABEL[a.status]}
                </span>
              </div>
              {a.status === "REJECTED" && a.rejectionReason && (
                <p className="text-xs text-red-soft mb-2">{a.rejectionReason}</p>
              )}
              {a.status === "MORE_INFO_REQUIRED" && a.additionalInfoRequest && (
                <p className="text-xs text-ink-2 mb-2">Moderator asked: “{a.additionalInfoRequest}”</p>
              )}
              {EDITABLE_STATUSES.includes(a.status) && (
                <button
                  type="button"
                  onClick={() => setEditingId(a.id)}
                  className="text-xs font-semibold text-red-soft"
                >
                  {a.status === "DRAFT" ? "Continue application →" : "Respond →"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {picking ? (
        <div className="flex flex-col gap-2">
          {availableTypes.map((t) =>
            t === "FANBASE" ? (
              <FanbaseTypeOption key="FANBASE" groups={ownedGroups} onStart={(groupId) => startApplication("FANBASE", groupId)} />
            ) : (
              <button
                key={t}
                type="button"
                onClick={() => startApplication(t)}
                className="rounded-lg border border-line-soft p-4 text-left"
              >
                <p className="text-sm font-semibold">{TYPE_META[t].label}</p>
                <p className="text-xs text-ink-3">{TYPE_META[t].description}</p>
              </button>
            ),
          )}
          <button type="button" onClick={() => setPicking(false)} className="text-xs text-ink-3 mt-1">
            Cancel
          </button>
        </div>
      ) : (
        availableTypes.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
          >
            Apply for a badge
          </button>
        )
      )}
      </div>
    </div>
  );
}

function FanbaseTypeOption({ groups, onStart }: { groups: OwnedGroup[]; onStart: (groupId: string) => void }) {
  const [groupId, setGroupId] = useState("");
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-line-soft p-4 opacity-50">
        <p className="text-sm font-semibold">{TYPE_META.FANBASE.label}</p>
        <p className="text-xs text-ink-3">You need to be the creator of a Fanbase group to apply.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line-soft p-4">
      <p className="text-sm font-semibold mb-1">{TYPE_META.FANBASE.label}</p>
      <p className="text-xs text-ink-3 mb-2">{TYPE_META.FANBASE.description}</p>
      <div className="flex gap-2">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none"
        >
          <option value="">Select a group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!groupId}
          onClick={() => onStart(groupId)}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Start
        </button>
      </div>
    </div>
  );
}

function ApplicationForm({
  application,
  onBack,
  onChange,
}: {
  application: Application;
  onBack: () => void;
  onChange: (updated: Application) => void;
}) {
  const toast = useToast();
  const editable = EDITABLE_STATUSES.includes(application.status);

  const [legalFirstName, setLegalFirstName] = useState(application.legalFirstName ?? "");
  const [legalLastName, setLegalLastName] = useState(application.legalLastName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(application.dateOfBirth?.slice(0, 10) ?? "");
  const [country, setCountry] = useState(application.country ?? "");
  const [region, setRegion] = useState(application.region ?? "");
  const [phone, setPhone] = useState(application.phone ?? "");
  const [documentType, setDocumentType] = useState(application.documentType ?? "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState(application.categoryData?.notes ?? "");
  const [documents, setDocuments] = useState(application.documents);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsIdentityDoc = application.type === "IDENTITY" || application.type === "BUSINESS";
  const docSlots = DOCUMENT_SLOTS[application.type] ?? [];

  async function saveDraft(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/verification/applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          legalFirstName: legalFirstName || undefined,
          legalLastName: legalLastName || undefined,
          dateOfBirth: dateOfBirth || undefined,
          country: country || undefined,
          region: region || undefined,
          phone: phone || undefined,
          documentType: needsIdentityDoc && documentType ? documentType : undefined,
          documentNumber: needsIdentityDoc && documentNumber ? documentNumber : undefined,
          categoryData: notes ? { notes } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      onChange(data.application);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const savedOk = await saveDraft();
      if (!savedOk) return;
      const res = await apiFetch(`/api/verification/applications/${application.id}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not submit");
      onChange(data.application);
      toast.success("Application submitted for review.");
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(docType: string, file: File) {
    try {
      await uploadVerificationDocument(application.id, docType, file);
      const res = await apiFetch(`/api/verification/applications/${application.id}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleDeleteDoc(docId: string) {
    const confirmed = window.confirm("This document will be permanently deleted. Continue?");
    if (!confirmed) return;
    const res = await apiFetch(`/api/verification/applications/${application.id}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((cur) => cur.filter((d) => d.id !== docId));
      toast.success("Document deleted.");
    } else {
      toast.error("Could not delete document.");
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-24">
      <button type="button" onClick={onBack} className="text-xs text-ink-3 mb-4">
        ← Back
      </button>
      <h1 className="font-serif text-2xl mb-1">{TYPE_META[application.type].label} verification</h1>
      <p className="text-xs text-ink-3 mb-6">{STATUS_LABEL[application.status]}</p>

      {!editable && (
        <p className="text-sm text-ink-2 mb-4">
          This application has already been {STATUS_LABEL[application.status].toLowerCase()} and can no longer be edited.
        </p>
      )}

      {application.status === "MORE_INFO_REQUIRED" && application.additionalInfoRequest && (
        <div className="rounded-lg border border-line-soft bg-surface-2 p-3 mb-4">
          <p className="text-xs font-semibold mb-0.5">A moderator requested more information</p>
          <p className="text-xs text-ink-2">{application.additionalInfoRequest}</p>
        </div>
      )}

      <fieldset disabled={!editable} className="flex flex-col gap-4 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Legal first name">
            <input value={legalFirstName} onChange={(e) => setLegalFirstName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Legal last name">
            <input value={legalLastName} onChange={(e) => setLegalLastName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Country">
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="NG" className={inputClass} />
          </Field>
          <Field label="Region / state">
            <input value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {needsIdentityDoc && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID type">
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={inputClass}>
                <option value="">Select…</option>
                <option value="NIN">NIN</option>
                <option value="PASSPORT">Passport</option>
                <option value="DRIVERS_LICENSE">Driver&apos;s license</option>
                <option value="VOTERS_CARD">Voter&apos;s card</option>
              </select>
            </Field>
            <Field label="ID number">
              <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className={inputClass} />
            </Field>
          </div>
        )}

        <Field label={application.type === "SELLER" || application.type === "CREATOR" ? "Anything else? (optional)" : "Tell us more"}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Links, context, or evidence supporting this application"
            className={inputClass}
          />
        </Field>

        {docSlots.length > 0 && (
          <div>
            <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Documents</p>
            <div className="flex flex-col gap-2">
              {docSlots.map((slot) => {
                const uploaded = documents.filter((d) => d.documentType === slot.type);
                return (
                  <div key={slot.type} className="rounded-lg border border-line-soft p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold">
                        {slot.label} {slot.required && <span className="text-red-soft">*</span>}
                      </p>
                      {editable && (
                        <label className="text-xs font-semibold text-red-soft cursor-pointer">
                          Upload
                          <input
                            type="file"
                            accept="image/png,image/jpeg,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(slot.type, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {uploaded.length === 0 ? (
                      <p className="text-[11px] text-ink-3">Not uploaded yet</p>
                    ) : (
                      uploaded.map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-[11px] text-ink-2">
                          <span>Uploaded {new Date(d.uploadedAt).toLocaleDateString()}</span>
                          {editable && (
                            <button type="button" onClick={() => handleDeleteDoc(d.id)} className="font-semibold text-red-soft">
                              Delete
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-soft mt-4">{error}</p>}

      {editable && (
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || submitting}
            className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-widest text-ink-3">{label}</span>
      {children}
    </label>
  );
}
