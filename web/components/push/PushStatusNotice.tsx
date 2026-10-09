"use client";

import { useCallback, useEffect, useState } from "react";
import { enablePush, isInstalledApp, isIos, pushPermission, registerIfAlreadyPermitted } from "@/lib/push";

// Push has no on/off toggle (explicit ask — always on; PushAutoEnroll signs
// every browser up). But when that fails nobody could tell: a blocked
// permission, an iPhone in a Safari tab, or a dismissed prompt left the
// account with no devices and no way back (explicit ask, 2026-10-09). This
// shows only in that case, with the one thing that fixes it on this device.

type Status =
  | { kind: "checking" | "on" | "off" | "blocked" | "ios-install" | "unsupported" }
  | { kind: "error"; error: string };

async function check(): Promise<Status> {
  const permission = pushPermission();
  if (permission === null) return { kind: isIos() && !isInstalledApp() ? "ios-install" : "unsupported" };
  if (permission === "denied") return { kind: "blocked" };
  if (permission === "default") return { kind: "off" };
  const result = await registerIfAlreadyPermitted();
  return !result || result.ok ? { kind: "on" } : { kind: "error", error: result.error };
}

function unblockSteps(): string {
  if (isIos()) return "Open your iPhone's Settings → Notifications → XOLDOUT, turn on Allow Notifications, then come back here.";
  if (/Android/.test(navigator.userAgent)) return "Tap ⋮ → Settings → Site settings → Notifications, allow xoldout.app, then reload.";
  return "Click the icon to the left of the address bar, set Notifications to Allow, then reload.";
}

export function PushStatusNotice({ showWhenOn = false, className = "" }: { showWhenOn?: boolean; className?: string }) {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void check().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    // Coming back from browser/phone settings — pick up the change.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function turnOn() {
    setBusy(true);
    try {
      const result = await enablePush();
      setStatus(result.ok ? { kind: "on" } : pushPermission() === "denied" ? { kind: "blocked" } : { kind: "error", error: result.error });
    } finally {
      setBusy(false);
    }
  }

  if (status.kind === "checking") return null;
  if (status.kind === "on") {
    if (!showWhenOn) return null;
    return (
      <div className={`rounded-xl border border-line bg-surface p-4 ${className}`}>
        <p className="text-sm font-semibold">✓ Notifications are on for this device</p>
        <p className="mt-0.5 text-xs text-ink-3">Sales, messages, Lives and more — even when XOLDOUT isn&apos;t open.</p>
      </div>
    );
  }

  const copy: Record<Exclude<Status["kind"], "checking" | "on">, { title: string; body: string }> = {
    off: { title: "Notifications are off on this device", body: "Turn them on to hear about sales, messages and Lives even when XOLDOUT isn't open." },
    blocked: { title: "Notifications are blocked on this device", body: unblockSteps() },
    "ios-install": {
      title: "Get notifications on your iPhone",
      body: "iPhone only sends web notifications to apps on your Home Screen: tap Share → Add to Home Screen, open XOLDOUT from there, then turn notifications on.",
    },
    unsupported: { title: "This browser can't get notifications", body: "Open XOLDOUT in Chrome, Edge or Firefox, or use the XOLDOUT app on your phone." },
    error: { title: "Couldn't turn on notifications", body: status.kind === "error" ? status.error : "" },
  };
  const { title, body } = copy[status.kind];
  const action =
    status.kind === "off" ? { label: busy ? "Turning on…" : "Turn on", onClick: turnOn }
    : status.kind === "error" ? { label: busy ? "Trying…" : "Try again", onClick: turnOn }
    : status.kind === "blocked" && !isIos() ? { label: "Reload", onClick: () => window.location.reload() }
    : null;

  return (
    <div className={`rounded-xl border border-amber/40 bg-amber/10 p-4 ${className}`}>
      <p className="text-sm font-semibold text-amber">🔕 {title}</p>
      <p className="mt-1 text-xs text-ink-2">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={busy}
          className="mt-3 rounded-lg bg-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
