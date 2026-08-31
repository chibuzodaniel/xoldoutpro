"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

export type ReportReason = "INAPPROPRIATE_CONTENT" | "COPYRIGHT_CLAIM" | "BUG" | "FEATURE_REQUEST";
export type ReportTargetType = "PRODUCT" | "EVENT" | "POST" | "PROFILE";

type Props = {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  reasons: { value: ReportReason; label: string }[];
  title?: string;
  detailsPlaceholder?: string;
};

// Bottom sheet, same shape as PublishSheet/PhotoActionSheet: dims the page
// behind it rather than covering it, closes on backdrop click.
export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  reasons,
  title = "Report",
  detailsPlaceholder = "Add any detail that might help (optional)",
}: Props) {
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setReason(null);
    setDetails("");
    setDone(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not submit report");
      }
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
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
            <p className="text-sm font-semibold mb-1">Report submitted</p>
            <p className="text-xs text-ink-3 mb-5">Thanks — our team will take a look.</p>
            <button type="button" onClick={handleClose} className="w-full rounded-lg bg-red py-3 text-sm font-semibold text-white">
              Done
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-2xl mb-4">{title}</h1>
            <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-3">
              {reasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className="flex items-center justify-between py-3.5 text-left"
                >
                  <span className="text-sm">{r.label}</span>
                  <span
                    className={`h-4 w-4 rounded-full border shrink-0 ${
                      reason === r.value ? "border-red bg-red" : "border-line-strong"
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              placeholder={detailsPlaceholder}
              rows={3}
              className="w-full resize-none rounded-lg border border-line-soft bg-transparent p-3 text-sm placeholder:text-ink-3 focus:outline-none mb-3"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="w-full rounded-lg bg-red py-3 text-sm font-semibold text-white disabled:opacity-40 mb-2"
            >
              {submitting ? "Submitting…" : "Submit report"}
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
