"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

// Super moderators: send the "Add your country" reminder (2026-11-13).
export function CountryReminderPanel() {
  const toast = useToast();
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/country-reminder")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCount(d?.wouldNotify ?? 0));
  }, []);

  async function send() {
    if (!count) return;
    if (!(await toast.confirm(`Send "Show where you're from 🌍" to ${count.toLocaleString("en-NG")} people (bell + push)?`, { confirmLabel: "Send" }))) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/country-reminder", { method: "POST", body: JSON.stringify({ send: true }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Could not send");
      toast.success(`Sent to ${d.sent.toLocaleString("en-NG")} people`);
      setCount(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-line-soft p-4">
      <p className="mb-1 text-[12px] font-bold uppercase tracking-widest text-ink-3">Country reminder</p>
      <p className="mb-3 text-xs text-ink-3">
        Reminds everyone who hasn&apos;t added a location to add one, so their country&apos;s flag shows next to their name. Skips people who hid their location
        and anyone reminded in the last 30 days.
      </p>
      <p className="mb-3 text-sm">{count === null ? "Counting…" : `${count.toLocaleString("en-NG")} people would get it.`}</p>
      <button type="button" onClick={send} disabled={busy || !count} className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Sending…" : "Send reminder"}
      </button>
    </div>
  );
}
