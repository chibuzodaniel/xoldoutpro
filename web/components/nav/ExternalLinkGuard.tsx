"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/ToastProvider";

// "You're leaving XOLDOUT" (explicit ask, 2026-11-12): any link to another
// site asks first, wherever it is (profile links, music platforms, posts,
// bios…). One listener for the whole app, in the capture phase so it runs
// before the link does. XOLDOUT's own pages and its file storage (screenshots,
// downloads) don't ask; nor do email and phone links.

function isOurs(host: string) {
  const h = host.toLowerCase();
  return (
    h === window.location.hostname ||
    h === "xoldout.app" ||
    h.endsWith(".xoldout.app") ||
    h.endsWith(".vercel.app") || // previews
    h.endsWith(".r2.dev") || // XOLDOUT file storage
    h.endsWith(".r2.cloudflarestorage.com")
  );
}

export function ExternalLinkGuard() {
  const toast = useToast();

  useEffect(() => {
    async function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button > 1) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || a.dataset.noLeaveWarning !== undefined) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (isOurs(url.hostname)) return;

      e.preventDefault();
      e.stopPropagation();
      const site = url.hostname.replace(/^www\./, "");
      const ok = await toast.confirm(`You're leaving XOLDOUT to visit ${site}. XOLDOUT isn't responsible for content on other sites.`, {
        confirmLabel: "Continue",
      });
      if (!ok) return;
      const newTab = a.target === "_blank" || e.metaKey || e.ctrlKey || e.button === 1;
      if (newTab) window.open(url.href, "_blank", "noopener,noreferrer");
      else window.location.href = url.href;
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, [toast]);

  return null;
}
