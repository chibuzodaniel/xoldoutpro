"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Slide-up sheet used by the v2 screens (design/v2-prototype): dimmed
// backdrop, rounded top, title + close. Rendered into <body> so it's never
// trapped inside a sticky/blurred parent. `height` "auto" fits the content;
// "half" opens it half-way up the screen.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  height = "auto",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  height?: "auto" | "half";
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      setShown(false);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-xl flex-col rounded-t-3xl border-t border-line bg-surface shadow-2xl transition-transform duration-300 ease-out ${
          height === "half" ? "h-[60vh] max-h-[640px]" : "max-h-[85vh]"
        } ${shown ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
        {title !== undefined && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-3">
            <h2 className="min-w-0 truncate text-[17px] font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${footer ? "" : "pb-[calc(env(safe-area-inset-bottom)+16px)]"}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-line-soft px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
