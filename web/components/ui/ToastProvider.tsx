"use client";

import { ToastContainer, Slide, toast, type ToastOptions } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// react-toastify replaces the hand-rolled toast stack this file used to
// implement directly (stacking, auto-dismiss, click-to-dismiss, slide
// animation all come from the library now); app/globals.css's
// `.Toastify__toast` overrides restyle its default look to this app's dark
// surface + red/green accents. Same icons and 4s duration as before, for
// visual parity with the toasts this replaced.
const ICONS = {
  success: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  ),
};

const BASE_OPTIONS: ToastOptions = {
  autoClose: 4000,
  hideProgressBar: true,
  closeButton: false,
};

// Kept as a hook — rather than every call site importing `toast` from
// react-toastify directly — purely so the nine existing `useToast()` call
// sites needed zero changes when this swapped from a hand-rolled
// context-based implementation to react-toastify underneath.
export type LiveSummaryToast = {
  peakViewers: number;
  giftsXg: number;
  giftsCount: number;
  paidAccessXg: number;
  paidRequestsXg: number;
};

function LiveSummaryContent({ summary }: { summary: LiveSummaryToast }) {
  const rows: [string, string][] = [
    ["Peak viewers", summary.peakViewers.toLocaleString("en-NG")],
    ["Gifts", `${summary.giftsXg.toLocaleString("en-NG")} XG (${summary.giftsCount})`],
    ["Paid access", `${summary.paidAccessXg.toLocaleString("en-NG")} XG`],
    ["Paid requests", `${summary.paidRequestsXg.toLocaleString("en-NG")} XG`],
  ];
  return (
    <div className="w-full">
      <p className="mb-1.5 text-[14px] font-semibold">Live ended</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  // Red confirm button — for deletes and anything else that cannot be undone.
  destructive?: boolean;
};

function ConfirmContent({
  message,
  options,
  onAnswer,
}: {
  message: string;
  options: ConfirmOptions;
  onAnswer: (ok: boolean) => void;
}) {
  return (
    <div className="w-full">
      <p className="mb-3 whitespace-pre-line text-[14px] leading-snug text-ink">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onAnswer(false)}
          className="rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-ink"
        >
          {options.cancelLabel ?? "Cancel"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => onAnswer(true)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white ${options.destructive ? "bg-red" : "bg-green"}`}
        >
          {options.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  return {
    error: (message: string) => toast.error(message, { ...BASE_OPTIONS, icon: ICONS.error }),
    success: (message: string) => toast.success(message, { ...BASE_OPTIONS, icon: ICONS.success }),
    // End-of-Live stats (app/(app)/live/[id]/broadcast/page.tsx) — longer
    // than the 4s default and dismissable, since there's more to read. The
    // container lives in the root layout, so it survives the redirect away
    // from the broadcast page.
    // Explicit ask, 2026-10-04: "whenever the website is trying to
    // communicate to a user it should use the react toast" — this replaces
    // every native window.confirm(). Resolves true only on the confirm
    // button; Cancel, or the toast being dismissed any other way, is false.
    // Stays up until answered (no auto-close, no click-anywhere dismiss).
    confirm: (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const answer = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
          toast.dismiss(id);
        };
        const id = toast(<ConfirmContent message={message} options={options} onAnswer={answer} />, {
          autoClose: false,
          closeOnClick: false,
          draggable: false,
          closeButton: false,
          hideProgressBar: true,
          icon: false,
          onClose: () => answer(false),
        });
      }),
    liveSummary: (summary: LiveSummaryToast) =>
      toast.success(<LiveSummaryContent summary={summary} />, { ...BASE_OPTIONS, icon: ICONS.success, autoClose: 9000, closeButton: true }),
  };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer position="top-right" transition={Slide} />
    </>
  );
}
