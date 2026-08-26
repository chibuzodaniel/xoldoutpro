"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "error" | "success";
type ToastItem = { id: number; kind: ToastKind; message: string; leaving: boolean };

type ToastContextValue = {
  error: (message: string) => void;
  success: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// The exit animation (globals.css .animate-toast-out) needs to actually play
// before the DOM node disappears — removing straight from the array on the
// dismiss timeout would just snap it out. So dismissal is two steps: flip
// `leaving` (starts the CSS animation) then, one animation-duration later,
// drop it from the array for real.
const EXIT_MS = 200;

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
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

// Top-right stack, sliding in/out from the right edge — a proper toast
// rather than the previous plain fade. Auto-dismisses after 4s. Kept
// intentionally simple — one shared stack, no queueing/priority — since
// this is meant to replace "the action silently did nothing" everywhere,
// not to be a rich notification center.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((cur) => [...cur, { id, kind, message, leaving: false }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const error = useCallback((message: string) => push("error", message), [push]);
  const success = useCallback((message: string) => push("success", message), [push]);

  return (
    <ToastContext.Provider value={{ error, success }}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur cursor-pointer ${
              t.leaving ? "animate-toast-out" : "animate-toast-in"
            } ${t.kind === "error" ? "border-red/30 bg-red/15 text-red-soft" : "border-green/30 bg-green/15 text-green"}`}
          >
            {KIND_ICON[t.kind]}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
