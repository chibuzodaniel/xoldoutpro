"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/api";

type Props = { open: boolean; onClose: () => void; handle: string };

// Bottom sheet, same shape as ReportSheet: dims the page behind it, closes
// on backdrop click. The confirm button stays disabled until the typed text
// exactly matches "DELETE <handle>" — deliberately requires the handle, not
// just the word DELETE, so it can't be cleared by muscle memory alone.
export function DeleteAccountSheet({ open, onClose, handle }: Props) {
  const router = useRouter();
  const requiredText = `DELETE ${handle}`;
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setInput("");
    setDone(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (input !== requiredText) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/me", { method: "DELETE", body: JSON.stringify({ confirmation: input }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't delete your account");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDoneContinue() {
    if (firebaseAuth) await signOut(firebaseAuth);
    router.push("/login");
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={handleClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-4">
            <p className="text-sm font-semibold mb-1">Account deleted</p>
            <p className="text-xs text-ink-3 mb-5">
              We&apos;ve emailed you a recovery link. You have 45 days to recover your account before it becomes
              permanently disabled and only restorable by a moderator.
            </p>
            <button
              type="button"
              onClick={handleDoneContinue}
              className="w-full rounded-lg bg-red py-3 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-2xl mb-2">Delete account</h1>
            <p className="text-sm text-ink-3 mb-4">
              This signs you out of every device and hides your profile immediately. You&apos;ll have 45 days to
              recover it — after that, only a moderator can restore it.
            </p>
            <label className="text-[12px] uppercase tracking-widest text-ink-3 mb-1 block">
              Type <span className="text-ink font-semibold">{requiredText}</span> to confirm
            </label>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={requiredText}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-lg border border-line-soft bg-transparent px-3 py-3 text-sm outline-none focus:border-red mb-3"
            />
            {error && <p className="text-xs text-red-soft mb-3">{error}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={input !== requiredText || submitting}
              className="w-full rounded-lg bg-red py-3 text-sm font-semibold text-white disabled:opacity-40 mb-2"
            >
              {submitting ? "Deleting…" : "Delete my account"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
