"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

type ModeratorRow = { id: string; handle: string; displayName: string; isSuperModerator: boolean };

// Only super-moderators see this — grants/revokes plain isModerator by
// handle, and (explicit ask) lets an existing super-moderator promote/demote
// other moderators to/from super-moderator too. The very first
// super-moderator still has to be set directly in the DB (PRD §3: internal
// staff, not a self-serve chain from nothing) — this only manages who else
// gets that status once at least one exists. POST /api/admin/moderators
// itself refuses to demote the last remaining super-moderator, so this UI
// can't lock everyone out even if the confirm step below is skipped.
export function ManageModeratorsPanel() {
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [moderators, setModerators] = useState<ModeratorRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/moderators");
    if (!res.ok) return;
    const data: { moderators: ModeratorRow[] } = await res.json();
    setModerators(data.moderators);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      const res = await apiFetch("/api/admin/moderators");
      if (!res.ok) return;
      const data: { moderators: ModeratorRow[] } = await res.json();
      setModerators(data.moderators);
    }
    initialLoad();
  }, []);

  async function setModeratorStatus(targetHandle: string, isModerator: boolean) {
    const trimmed = targetHandle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/moderators", {
        method: "POST",
        body: JSON.stringify({ handle: trimmed, isModerator }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      toast.success(`@${trimmed} is ${isModerator ? "now a moderator" : "no longer a moderator"}.`);
      setHandle("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function setSuperStatus(targetHandle: string, isSuperModerator: boolean) {
    if (isSuperModerator) {
      const ok = window.confirm(`Make @${targetHandle} a super-moderator? They'll be able to promote/demote other moderators too.`);
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/moderators", {
        method: "POST",
        body: JSON.stringify({ handle: targetHandle, isSuperModerator }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      toast.success(`@${targetHandle} is ${isSuperModerator ? "now a super-moderator" : "no longer a super-moderator"}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Manage moderators</p>
      <div className="flex gap-2 mb-3">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="handle"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => setModeratorStatus(handle, true)}
          disabled={busy || !handle.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Grant
        </button>
      </div>

      {moderators === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : moderators.length === 0 ? (
        <p className="text-xs text-ink-3">No moderators yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {moderators.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm">
                  {m.displayName} <span className="text-ink-3">@{m.handle}</span>
                  {m.isSuperModerator && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Super</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setSuperStatus(m.handle, !m.isSuperModerator)}
                  disabled={busy}
                  className="text-xs font-semibold text-ink-3 disabled:opacity-40"
                >
                  {m.isSuperModerator ? "Remove super" : "Make super"}
                </button>
                {!m.isSuperModerator && (
                  <button
                    type="button"
                    onClick={() => setModeratorStatus(m.handle, false)}
                    disabled={busy}
                    className="text-xs text-red-soft font-semibold disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

