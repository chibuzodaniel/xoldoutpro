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
export function useToast() {
  return {
    error: (message: string) => toast.error(message, { ...BASE_OPTIONS, icon: ICONS.error }),
    success: (message: string) => toast.success(message, { ...BASE_OPTIONS, icon: ICONS.success }),
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
