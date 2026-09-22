"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

type QueueApplication = {
  id: string;
  type: string;
  status: string;
  submittedAt: string | null;
  user: { handle: string; displayName: string };
  group: { id: string; name: string } | null;
  documents: { id: string; documentType: string; status: string; uploadedAt: string }[];
};

type QueueApplicationDetail = Omit<QueueApplication, "documents"> & {
  legalFirstName: string | null;
  legalLastName: string | null;
  dateOfBirth: string | null;
  country: string | null;
  region: string | null;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  categoryData: { notes?: string } | null;
  eligibilitySnapshot: unknown;
  internalNotes: string | null;
  grantedBadgeType: string | null;
  rejectionReason: string | null;
  additionalInfoRequest: string | null;
  suspendedReason: string | null;
  revokedReason: string | null;
  documents: { id: string; documentType: string; status: string; uploadedAt: string; viewUrl: string }[];
  auditLogs: { id: string; action: string; createdAt: string; metadata: unknown; actor: { handle: string; displayName: string } }[];
};

const QUEUE_FILTERS = [
  { value: "", label: "Open (submitted / in review)" },
  { value: "APPROVED", label: "Approved (suspend/revoke)" },
  { value: "ALL", label: "All" },
] as const;

// Review queue for VerificationApplication (schema-backed, PRD §12/§18-aware
// workflow) — distinct from VerifyCreatorPanel/VerifyGroupPanel above, which
// are the older blunt toggles kept for backward compatibility.
export function VerificationQueuePanel() {
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]["value"]>("");
  const [queue, setQueue] = useState<QueueApplication[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueApplicationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [fanbaseBadge, setFanbaseBadge] = useState<"OFFICIAL_FANBASE" | "RECOGNIZED_COMMUNITY">("OFFICIAL_FANBASE");

  const load = useCallback(async (statusFilter: string) => {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const res = await apiFetch(`/api/admin/verification/applications${qs}`);
    if (!res.ok) return setQueue([]);
    const data: { applications: QueueApplication[] } = await res.json();
    setQueue(data.applications);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      const qs = filter ? `?status=${filter}` : "";
      const res = await apiFetch(`/api/admin/verification/applications${qs}`);
      if (!res.ok) return setQueue([]);
      const data: { applications: QueueApplication[] } = await res.json();
      setQueue(data.applications);
    }
    initialLoad();
  }, [filter]);

  async function expand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setMessageDraft("");
    const res = await apiFetch(`/api/admin/verification/applications/${id}`);
    if (res.ok) {
      const data: { application: QueueApplicationDetail } = await res.json();
      setDetail(data.application);
    }
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/admin/verification/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update application");
      toast.success("Updated.");
      await load(filter);
      setExpandedId(null);
      setDetail(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Verification applications</p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-line bg-transparent px-2 py-1 text-xs outline-none"
        >
          {QUEUE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {queue === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map((a) => (
            <div key={a.id} className="rounded-lg border border-line-soft">
              <button type="button" onClick={() => expand(a.id)} className="w-full flex items-center justify-between p-3 text-left">
                <div>
                  <p className="text-sm font-semibold">
                    {a.type} · {a.group ? a.group.name : a.user.displayName} <span className="text-ink-3">@{a.user.handle}</span>
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {a.status} · {a.submittedAt ? new Date(a.submittedAt).toLocaleString("en-NG") : "not submitted"} · {a.documents.length} doc
                    {a.documents.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-ink-3">{expandedId === a.id ? "▾" : "›"}</span>
              </button>

              {expandedId === a.id && (
                <div className="border-t border-line-soft p-3">
                  {detail === null ? (
                    <p className="text-xs text-ink-3">Loading…</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="text-xs text-ink-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>Name: {[detail.legalFirstName, detail.legalLastName].filter(Boolean).join(" ") || "—"}</span>
                        <span>DOB: {detail.dateOfBirth ? new Date(detail.dateOfBirth).toLocaleDateString() : "—"}</span>
                        <span>Country: {detail.country || "—"}</span>
                        <span>Region: {detail.region || "—"}</span>
                        <span>Phone: {detail.phone || "—"}</span>
                        <span>
                          ID: {detail.documentType || "—"} {detail.documentNumber ? `· ${detail.documentNumber}` : ""}
                        </span>
                      </div>
                      {detail.categoryData?.notes && (
                        <p className="text-xs text-ink-2">
                          <span className="text-ink-3">Notes: </span>
                          {detail.categoryData.notes}
                        </p>
                      )}

                      {detail.documents.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {detail.documents.map((d) => (
                            <a
                              key={d.id}
                              href={d.viewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold"
                            >
                              View {d.documentType}
                            </a>
                          ))}
                        </div>
                      )}

                      {detail.auditLogs.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          {detail.auditLogs.map((log) => (
                            <p key={log.id} className="text-[11px] text-ink-3">
                              {new Date(log.createdAt).toLocaleString("en-NG")} — {log.action} by {log.actor.displayName}
                            </p>
                          ))}
                        </div>
                      )}

                      {["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_REQUIRED"].includes(detail.status) && (
                        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
                          <div className="flex flex-wrap gap-2">
                            {detail.status === "SUBMITTED" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => act(detail.id, { action: "under_review" })}
                                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                              >
                                Start review
                              </button>
                            )}
                            {detail.type === "FANBASE" ? (
                              <>
                                <select
                                  value={fanbaseBadge}
                                  onChange={(e) => setFanbaseBadge(e.target.value as typeof fanbaseBadge)}
                                  className="rounded-lg border border-line bg-transparent px-2 py-1.5 text-xs outline-none"
                                >
                                  <option value="OFFICIAL_FANBASE">Official fanbase</option>
                                  <option value="RECOGNIZED_COMMUNITY">Recognized community</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => act(detail.id, { action: "approve", fanbaseBadge })}
                                  className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                  Approve
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => act(detail.id, { action: "approve" })}
                                className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                              >
                                Approve
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={messageDraft}
                              onChange={(e) => setMessageDraft(e.target.value)}
                              placeholder="Reason / message"
                              className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-red"
                            />
                            <button
                              type="button"
                              disabled={busy || !messageDraft.trim()}
                              onClick={() => act(detail.id, { action: "request_info", message: messageDraft.trim() })}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40 shrink-0"
                            >
                              Request info
                            </button>
                            <button
                              type="button"
                              disabled={busy || !messageDraft.trim()}
                              onClick={() => act(detail.id, { action: "reject", reason: messageDraft.trim() })}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-red-soft disabled:opacity-40 shrink-0"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {detail.status === "APPROVED" && (
                        <div className="flex gap-2 border-t border-line-soft pt-3">
                          <input
                            value={messageDraft}
                            onChange={(e) => setMessageDraft(e.target.value)}
                            placeholder="Reason"
                            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-red"
                          />
                          <button
                            type="button"
                            disabled={busy || !messageDraft.trim()}
                            onClick={() => act(detail.id, { action: "suspend", reason: messageDraft.trim() })}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40 shrink-0"
                          >
                            Suspend
                          </button>
                          <button
                            type="button"
                            disabled={busy || !messageDraft.trim()}
                            onClick={() => act(detail.id, { action: "revoke", reason: messageDraft.trim() })}
                            className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 shrink-0"
                          >
                            Revoke
                          </button>
                        </div>
                      )}

                      {detail.status === "SUSPENDED" && (
                        <div className="flex gap-2 border-t border-line-soft pt-3">
                          <input
                            value={messageDraft}
                            onChange={(e) => setMessageDraft(e.target.value)}
                            placeholder="Reason"
                            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-red"
                          />
                          <button
                            type="button"
                            disabled={busy || !messageDraft.trim()}
                            onClick={() => act(detail.id, { action: "revoke", reason: messageDraft.trim() })}
                            className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 shrink-0"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// /moderation's own login gate (explicit ask: a moderator should be able to
// go straight here and log in, not get bounced through the consumer /login
// page first). Deliberately lighter than that page — no Google sign-in, no
// "create an account" link — moderator accounts are internal staff,
// provisioned directly in the DB (PRD §3), never self-serve signups.
// AuthProvider's onAuthStateChanged listener picks up the resulting
// firebaseUser automatically; this component doesn't need to redirect
// anywhere itself, ModerationPage just re-renders past this branch once
// appUser syncs in.
