"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

export function RestoreAccountPanel() {
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<{ handle: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore() {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/admin/restore-account", { method: "POST", body: JSON.stringify({ handle: trimmed }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not restore");
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Restore a deleted account</p>
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
          onClick={restore}
          disabled={busy || !handle.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Restore
        </button>
      </div>
      {result && <p className="text-xs text-ink-3">@{result.handle} has been restored.</p>}
    </div>
  );
}

