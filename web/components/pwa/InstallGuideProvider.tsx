"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { InstallSheet } from "./InstallSheet";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS() {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support, not "iPad" — the
  // touch-point check is the only reliable way to tell it apart from a Mac.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const InstallGuideContext = createContext<{ open: () => void } | null>(null);

export function useInstallGuide() {
  const ctx = useContext(InstallGuideContext);
  if (!ctx) throw new Error("useInstallGuide must be used within InstallGuideProvider");
  return ctx;
}

// Global, like PlayerProvider/BottomNav — the install sheet needs to be
// triggerable from onboarding (right after profile setup) and from Profile
// (anytime later), and float over whichever page is underneath rather than
// being a route of its own.
//
// `beforeinstallprompt` fires once, early, shortly after the app loads —
// often well before a user ever opens this sheet. It has to be listened for
// from the moment the app mounts, not from the moment the sheet opens, or
// the event is lost forever and the sheet can never show a real "Install"
// button, only the generic fallback text.
export function InstallGuideProvider({ children }: { children: React.ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time platform detection on app mount, not per-render derived state */
    if (isStandalone()) {
      setInstalled(true);
      setReady(true);
      return;
    }
    if (isIOS()) {
      setIos(true);
      setReady(true);
      return;
    }

    function handlePrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setReady(true);
    }
    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    // Only matters for the sheet's very first open before the event (if any)
    // has arrived — real users reach the sheet well after this fires.
    const timer = setTimeout(() => setReady(true), 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      clearTimeout(timer);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  return (
    <InstallGuideContext.Provider value={{ open: () => setSheetOpen(true) }}>
      {children}
      <InstallSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        ready={ready}
        installed={installed}
        ios={ios}
        canInstall={Boolean(deferredPrompt)}
        onInstallClick={handleInstallClick}
      />
    </InstallGuideContext.Provider>
  );
}
