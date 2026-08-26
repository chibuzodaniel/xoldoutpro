"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "xoldout_moderator_otp_until";
const SESSION_MS = 60_000; // explicit ask: 60s of inactivity
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

function readStoredUntil(): number {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0; // sessionStorage unavailable (private mode, etc.) — just never pre-verified
  }
}

function writeStoredUntil(until: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(until));
  } catch {
    // Session simply won't survive a reload; the in-memory timer still works.
  }
}

function clearStoredUntil() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Explicit ask: a moderator's OTP step-up is only good for 60 seconds of
// inactivity — any mouse/keyboard/touch/scroll activity extends it, but
// once it lapses the dashboard bounces to a normal-user route and a fresh
// OTP is required to get back in. The "valid until" timestamp lives in
// sessionStorage (not just a React ref) specifically so a reload *within*
// an active window doesn't spuriously re-prompt for a code, while a
// genuinely stale/reopened tab still does.
export function useModeratorSession() {
  const router = useRouter();
  const [verified, setVerified] = useState(() => readStoredUntil() > Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expire = useCallback(() => {
    clearStoredUntil();
    setVerified(false);
    router.push("/discover");
  }, [router]);

  const markVerified = useCallback(() => {
    writeStoredUntil(Date.now() + SESSION_MS);
    setVerified(true);
  }, []);

  useEffect(() => {
    if (!verified) return;

    function extend() {
      writeStoredUntil(Date.now() + SESSION_MS);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(expire, SESSION_MS);
    }

    extend();
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, extend, { passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, extend);
    };
  }, [verified, expire]);

  return { verified, markVerified };
}
