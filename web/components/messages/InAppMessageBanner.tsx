"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { DmAvatar } from "./Avatar";

// In-app notification for direct messages (explicit ask, 2026-10-05: "full
// time push and in app notification"): while someone is using the site, a
// banner slides in for each new message — except in the conversation it
// belongs to, or on the Messages inbox (which updates itself). Driven by a
// short poll of GET /api/messages/latest, so it works even where push is
// blocked; a foreground push (PushAutoEnroll) just triggers an immediate check.

const POLL_MS = 6_000;
const SHOW_MS = 5_000;

type Incoming = {
  messageId: string;
  conversationId: string;
  sender: { displayName: string; avatarUrl: string | null };
  isRequest: boolean;
  preview: string;
  createdAt: string;
};

export function InAppMessageBanner() {
  const { appUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [banner, setBanner] = useState<Incoming | null>(null);
  const sinceRef = useRef<string | null>(null);
  const shownRef = useRef(new Set<string>());
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const since = sinceRef.current;
    const res = await apiFetch(`/api/messages/latest${since ? `?since=${encodeURIComponent(since)}` : ""}`).catch(() => null);
    if (!res?.ok) return;
    const data: { messages: Incoming[]; serverTime: string } = await res.json();
    const first = sinceRef.current === null;
    sinceRef.current = data.serverTime;
    // The very first check only sets the starting point — no banners for
    // messages that arrived before the page was opened.
    if (first) return;
    const path = pathRef.current ?? "";
    const fresh = data.messages.filter(
      (m) => !shownRef.current.has(m.messageId) && path !== `/messages/${m.conversationId}` && path !== "/messages",
    );
    fresh.forEach((m) => shownRef.current.add(m.messageId));
    if (fresh.length > 0) {
      setBanner(fresh[0]);
      window.dispatchEvent(new Event("xoldout:notifications-changed"));
    }
  }, []);

  useEffect(() => {
    if (!appUser) return;
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    const now = () => void check();
    window.addEventListener("xoldout:messages-check", now);
    document.addEventListener("visibilitychange", now);
    return () => {
      clearInterval(id);
      window.removeEventListener("xoldout:messages-check", now);
      document.removeEventListener("visibilitychange", now);
    };
  }, [appUser, check]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [banner]);

  if (!banner) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[max(env(safe-area-inset-top),10px)]">
      <button
        type="button"
        onClick={() => {
          setBanner(null);
          router.push(`/messages/${banner.conversationId}`);
        }}
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface/95 px-3 py-2.5 text-left shadow-2xl backdrop-blur animate-gift-banner"
      >
        <DmAvatar person={banner.sender} className="h-10 w-10 text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            {banner.sender.displayName}
            {banner.isRequest && <span className="ml-1.5 text-[11px] font-normal text-amber">Message request</span>}
          </span>
          <span className="block truncate text-[13px] text-ink-2">{banner.preview}</span>
        </span>
        <span className="shrink-0 text-[12px] font-semibold text-red-soft">Open</span>
      </button>
    </div>
  );
}
