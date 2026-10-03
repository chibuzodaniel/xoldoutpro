"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { enablePush, listenForForegroundPush, pushPermission, registerIfAlreadyPermitted } from "@/lib/push";
import { useToast } from "@/components/ui/ToastProvider";

// Don't re-prompt a browser that dismissed the permission dialog more often
// than this (a dismissal leaves permission at "default", so it could
// otherwise ask on every visit).
const REPROMPT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const PROMPTED_KEY = "xoldout.pushPromptedAt";

function readPromptedAt(): number {
  try {
    return Number(localStorage.getItem(PROMPTED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writePromptedAt() {
  try {
    localStorage.setItem(PROMPTED_KEY, String(Date.now()));
  } catch {
    // blocked storage — worst case we ask again next visit
  }
}

/**
 * Push is always on (explicit ask — there is no on/off setting any more;
 * the Edit Profile toggle was removed). Every signed-in user's browser gets
 * registered automatically:
 *  - permission already granted → register silently on load;
 *  - permission not decided yet → ask on their first tap/click (browsers,
 *    Safari especially, only allow the prompt from a user gesture);
 *  - permission denied → nothing a page can do; only browser settings can.
 * Registering also sets User.pushEnabled back on (POST /api/me/push-devices),
 * which re-enables accounts that had switched it off under the old toggle.
 */
export function PushAutoEnroll() {
  const { appUser } = useAuth();
  const userId = appUser?.id;
  const toast = useToast();

  // Pushes that arrive while XOLDOUT is open: system notification (via the
  // service worker) + an in-app toast, and tell the bell to refresh.
  useEffect(() => {
    if (!userId) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void listenForForegroundPush((data) => {
      if (data.title) toast.success(data.body ? `${data.title} — ${data.body}` : data.title);
      window.dispatchEvent(new Event("xoldout:notifications-changed"));
    }).then((fn) => {
      if (cancelled) fn();
      else unsubscribe = fn;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is a fresh object each render; the listener must not resubscribe every render
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const permission = pushPermission();
    if (permission === null || permission === "denied") return;

    if (permission === "granted") {
      void registerIfAlreadyPermitted();
      return;
    }

    if (Date.now() - readPromptedAt() < REPROMPT_AFTER_MS) return;
    const onFirstGesture = () => {
      cleanup();
      writePromptedAt();
      void enablePush();
    };
    const cleanup = () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });
    return cleanup;
  }, [userId]);

  return null;
}
