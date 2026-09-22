"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

type PendingGroup = {
  id: string;
  name: string;
  verificationRequestedAt: string;
  creator: { handle: string; displayName: string };
};

// Mirrors VerifyCreatorPanel above, plus a queue of groups that actually
// applied — a moderator otherwise has no way to know which names to look up.
export function VerifyGroupPanel() {
  const toast = useToast();
  const [pending, setPending] = useState<PendingGroup[] | null>(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ name: string; isVerified: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/verify-group");
    if (!res.ok) {
      setPending([]);
      return;
    }
    const data: { pending: PendingGroup[] } = await res.json();
    setPending(data.pending);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      const res = await apiFetch("/api/admin/verify-group");
      if (!res.ok) {
        setPending([]);
        return;
      }
      const data: { pending: PendingGroup[] } = await res.json();
      setPending(data.pending);
    }
    initialLoad();
  }, []);

  async function toggle(groupName: string, verified: boolean) {
    setBusy(groupName);
    try {
      const res = await apiFetch("/api/admin/verify-group", { method: "POST", body: JSON.stringify({ name: groupName, verified }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      setResult(data);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Verify a Fanbase group</p>

      {pending === null ? (
        <p className="text-xs text-ink-3 mb-3">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-xs text-ink-3 mb-3">No pending verification requests.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-3">
          {pending.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-semibold">{g.name}</p>
                <p className="text-[12px] text-ink-3">by {g.creator.displayName}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggle(g.name, true)}
                  disabled={busy === g.name}
                  className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => toggle(g.name, false)}
                  disabled={busy === g.name}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setResult(null);
          }}
          placeholder="group name"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => toggle(name, true)}
          disabled={busy === name || !name.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => toggle(name, false)}
          disabled={busy === name || !name.trim()}
          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 disabled:opacity-40"
        >
          Unverify
        </button>
      </div>
      {result && (
        <p className="text-xs text-ink-3">
          &quot;{result.name}&quot; is now {result.isVerified ? "verified" : "not verified"}.
        </p>
      )}
    </div>
  );
}

