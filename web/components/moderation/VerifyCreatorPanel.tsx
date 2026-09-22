"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

export function VerifyCreatorPanel() {
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<{ handle: string; isVerified: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(verified: boolean) {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/verify", { method: "POST", body: JSON.stringify({ handle: trimmed, verified }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Verify a creator</p>
      <div className="flex gap-2 mb-2">
        <input
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setResult(null);
          }}
          placeholder="handle"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={busy || !handle.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          disabled={busy || !handle.trim()}
          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 disabled:opacity-40"
        >
          Unverify
        </button>
      </div>
      {result && (
        <p className="text-xs text-ink-3">
          @{result.handle} is now {result.isVerified ? "verified" : "not verified"}.
        </p>
      )}
    </div>
  );
}

// Escape hatch once a self-deleted account's 45-day recovery window has
// closed (see /api/account/recover) — no deadline check on this endpoint,
// a moderator can restore at any point after.
