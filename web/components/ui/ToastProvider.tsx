"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "error" | "success";
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  error: (message: string) => void;
  success: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Fixed above the bottom nav/mini player stack (both live at the root layout
// too), auto-dismissing after 4s. Kept intentionally simple — one shared
// stack, no queueing/priority — since this is meant to replace "the action
// silently did nothing" everywhere, not to be a rich notification center.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((cur) => [...cur, { id, kind, message }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }, []);

  const error = useCallback((message: string) => push("error", message), [push]);
  const success = useCallback((message: string) => push("success", message), [push]);

  return (
    <ToastContext.Provider value={{ error, success }}>
      {children}
      <div className="fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur ${
              t.kind === "error"
                ? "border-red/30 bg-red/15 text-red-soft"
                : "border-green/30 bg-green/15 text-green"
            }`}
          >
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
