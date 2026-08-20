"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type JoinRequest = { id: string; user: { id: string; handle: string; displayName: string; avatarUrl: string | null } };
type Member = { userId: string; role: "ADMIN" | "MEMBER"; user: { id: string; handle: string; displayName: string; avatarUrl: string | null } };

type Props = {
  groupId: string;
  isCreator: boolean;
  open: boolean;
  onClose: () => void;
  postPermission: "CREATOR_ONLY" | "ADMINS" | "ALL_MEMBERS";
  visibility: "OPEN" | "REQUEST_TO_JOIN";
  isVerified: boolean;
  verificationRequestedAt: string | null;
  onSettingsChanged: (next: { postPermission?: string; visibility?: string }) => void;
  onDeleted: () => void;
};

const POST_PERMISSION_LABEL: Record<Props["postPermission"], string> = {
  CREATOR_ONLY: "Creator only",
  ADMINS: "Admins",
  ALL_MEMBERS: "All members",
};

// Bottom sheet, same shell as the rest of the app's sheets — join requests,
// per-group settings (visibility, who may post), and the admin list all
// live here since only a creator/admin ever opens it.
export function ManageGroupSheet({
  groupId,
  isCreator,
  open,
  onClose,
  postPermission,
  visibility,
  isVerified,
  verificationRequestedAt,
  onSettingsChanged,
  onDeleted,
}: Props) {
  const [tab, setTab] = useState<"requests" | "members" | "settings">("requests");
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [requestedAt, setRequestedAt] = useState(verificationRequestedAt);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  async function deleteGroup() {
    if (!window.confirm(`Delete this Fanbase? This removes every message and can't be undone.`)) return;
    setDeletingGroup(true);
    try {
      const res = await apiFetch(`/api/groups/${groupId}`, { method: "DELETE" });
      if (res.ok) onDeleted();
      else setDeletingGroup(false);
    } catch {
      setDeletingGroup(false);
    }
  }

  async function requestVerification() {
    setRequestingVerification(true);
    try {
      const res = await apiFetch(`/api/groups/${groupId}/verification-request`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRequestedAt(data.verificationRequestedAt);
      }
    } finally {
      setRequestingVerification(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    apiFetch(`/api/groups/${groupId}/join-requests`)
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) => setRequests(data.requests));
    apiFetch(`/api/groups/${groupId}/members`)
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data) => setMembers(data.members));
  }, [open, groupId]);

  async function respond(requestId: string, action: "approve" | "reject") {
    const res = await apiFetch(`/api/groups/${groupId}/join-requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ action }) });
    if (res.ok) setRequests((cur) => cur?.filter((r) => r.id !== requestId) ?? null);
  }

  async function setRole(userId: string, role: "ADMIN" | "MEMBER") {
    const res = await apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
    if (res.ok) setMembers((cur) => cur?.map((m) => (m.userId === userId ? { ...m, role } : m)) ?? null);
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Remove this member from the group?")) return;
    const res = await apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) setMembers((cur) => cur?.filter((m) => m.userId !== userId) ?? null);
  }

  async function updateSetting(patch: { postPermission?: string; visibility?: string }) {
    const res = await apiFetch(`/api/groups/${groupId}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.ok) onSettingsChanged(patch);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <h1 className="font-serif text-2xl mb-4">Manage group</h1>

        <div className="flex items-center gap-4 border-b border-line-soft mb-4">
          {(["requests", "members", "settings"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-2.5 text-[14px] font-semibold capitalize border-b-2 ${
                tab === t ? "text-white border-red" : "text-ink-3 border-transparent"
              }`}
            >
              {t === "requests" ? "Requests" : t}
            </button>
          ))}
        </div>

        {tab === "requests" &&
          (requests === null ? (
            <p className="text-sm text-ink-3">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-ink-3">No pending requests.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <span className="text-sm">{r.user.displayName}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => respond(r.id, "approve")} className="text-xs font-semibold text-red-soft">
                      Approve
                    </button>
                    <button type="button" onClick={() => respond(r.id, "reject")} className="text-xs text-ink-3">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "members" &&
          (members === null ? (
            <p className="text-sm text-ink-3">Loading…</p>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm">{m.user.displayName}</p>
                    <p className="text-[11px] uppercase tracking-widest text-ink-3">{m.role}</p>
                  </div>
                  {isCreator && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRole(m.userId, m.role === "ADMIN" ? "MEMBER" : "ADMIN")}
                        className="text-xs text-ink-3"
                      >
                        {m.role === "ADMIN" ? "Remove admin" : "Make admin"}
                      </button>
                      <button type="button" onClick={() => removeMember(m.userId)} className="text-xs text-red-soft">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

        {tab === "settings" && (
          <div className="flex flex-col gap-4">
            {!isCreator ? (
              <p className="text-sm text-ink-3">Only the creator can change these.</p>
            ) : (
              <>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Who can post</p>
                  <div className="flex flex-wrap gap-2">
                    {(["CREATOR_ONLY", "ADMINS", "ALL_MEMBERS"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateSetting({ postPermission: p })}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          postPermission === p ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2"
                        }`}
                      >
                        {POST_PERMISSION_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Visibility</p>
                  <div className="flex gap-2">
                    {(["REQUEST_TO_JOIN", "OPEN"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => updateSetting({ visibility: v })}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          visibility === v ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2"
                        }`}
                      >
                        {v === "OPEN" ? "Open to anyone" : "Request to join"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Verification</p>
                  {isVerified ? (
                    <p className="text-xs text-green">This Fanbase is verified.</p>
                  ) : requestedAt ? (
                    <p className="text-xs text-ink-3">Verification requested — a moderator will review it.</p>
                  ) : (
                    <>
                      <p className="text-xs text-ink-3 mb-2">
                        Verified Fanbases get a badge next to their name wherever they&apos;re shown.
                      </p>
                      <button
                        type="button"
                        onClick={requestVerification}
                        disabled={requestingVerification}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-50"
                      >
                        {requestingVerification ? "…" : "Apply for verification"}
                      </button>
                    </>
                  )}
                </div>
                <div className="border-t border-line-soft pt-4">
                  <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Danger zone</p>
                  <button
                    type="button"
                    onClick={deleteGroup}
                    disabled={deletingGroup}
                    className="rounded-lg border border-red-soft px-3 py-1.5 text-xs font-semibold text-red-soft disabled:opacity-50"
                  >
                    {deletingGroup ? "Deleting…" : "Delete this Fanbase"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
