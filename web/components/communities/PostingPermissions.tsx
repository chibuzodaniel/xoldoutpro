"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { POSTING_MODES, POSTING_MODE_LABEL, type PostingMode } from "@/lib/communities/timelineRules";

// Manage community → Member Posting Permissions (explicit ask, 2026-11-11).
// Any admin can switch it at any time; saved as soon as one is picked.
export function PostingPermissions({ communityId }: { communityId: string }) {
  const toast = useToast();
  const [mode, setMode] = useState<PostingMode | null>(null);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/communities/${communityId}/posting`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setMode(d.mode);
        setPending(d.pending);
      })
      .catch(() => {});
  }, [communityId]);

  async function pick(next: PostingMode) {
    if (next === mode || saving) return;
    const before = mode;
    setMode(next);
    setSaving(true);
    try {
      const res = await apiFetch(`/api/communities/${communityId}/posting`, { method: "PATCH", body: JSON.stringify({ mode: next }) });
      if (!res.ok) throw new Error();
      toast.success(`${POSTING_MODE_LABEL[next].title} is on`);
    } catch {
      setMode(before);
      toast.error("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl font-bold">Member Posting Permissions</h2>
      <p className="text-sm text-ink-3">Who can publish new posts on the Timeline. Admins can always post, and members can always comment, reply, like and vote.</p>
      {mode === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div role="radiogroup" className="flex flex-col gap-2">
          {POSTING_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => pick(m)}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left ${mode === m ? "border-red bg-red/10" : "border-line bg-surface"}`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${mode === m ? "border-red" : "border-line"}`}>
                {mode === m && <span className="h-2.5 w-2.5 rounded-full bg-red" />}
              </span>
              <span>
                <span className="block font-bold">{POSTING_MODE_LABEL[m].title}</span>
                <span className="block text-[13px] text-ink-3">{POSTING_MODE_LABEL[m].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {pending > 0 && (
        <Link href={`/groups/${communityId}?review=1`} className="rounded-2xl border border-red/40 bg-red/10 px-4 py-3 text-sm font-semibold">
          {pending} post{pending === 1 ? "" : "s"} waiting for approval — review now ›
        </Link>
      )}
    </section>
  );
}
