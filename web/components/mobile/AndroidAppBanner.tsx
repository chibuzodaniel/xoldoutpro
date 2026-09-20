"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "xoldout_apk_banner_dismissed_build";

type VersionResponse = { version: string | null; buildNumber: number | null; url: string | null };

function isAndroid() {
  return /Android/.test(window.navigator.userAgent);
}

// Sideloaded APK download, not the PWA install steps on /signup
// (InstallGuideProvider) — this points Android visitors at the native app
// (mobile/, which owns play/library/social/creator tools per the product
// split) rather than the "Add to Home Screen" web shortcut. Fed by GET
// /api/mobile/version, which POST /api/internal/apk-release writes after
// mobile's `npm run publish-apk` ships a build.
export function AndroidAppBanner() {
  const [remote, setRemote] = useState<VersionResponse | null>(null);
  const [android, setAndroid] = useState(false);
  const [dismissedBuild, setDismissedBuild] = useState<number | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time platform/dismiss-state read on mount */
    if (!isAndroid()) return;
    setAndroid(true);
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed) setDismissedBuild(Number(dismissed));
    } catch {
      // localStorage unavailable — banner just won't remember a dismiss.
    }
    fetch("/api/mobile/version")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: VersionResponse | null) => data && setRemote(data))
      .catch(() => {});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!android || !remote?.buildNumber || !remote.url || remote.buildNumber === dismissedBuild) return null;

  function dismiss() {
    setDismissedBuild(remote!.buildNumber);
    try {
      localStorage.setItem(DISMISSED_KEY, String(remote!.buildNumber));
    } catch {
      // Best-effort only.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-red/10 border-b border-red/30 px-4 py-2 text-xs">
      <span className="text-ink">
        Get the XOLDOUT app{remote.version ? ` (${remote.version})` : ""} for the full experience
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <a href={remote.url} className="font-semibold text-red-soft">
          Download
        </a>
        <button type="button" onClick={dismiss} className="text-ink-3">
          Dismiss
        </button>
      </div>
    </div>
  );
}
