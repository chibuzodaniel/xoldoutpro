"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/live/BottomSheet";
import { SendToChatSheet } from "@/components/messages/SendToChatButton";

// The Live header's share controls (explicit ask, 2026-10-08: the "Send"
// label didn't say what it did, and the Share/Send pills squeezed the host's
// name to "M…"). Two round icons instead: a paper plane that sends the Live
// in a direct message, and a share icon that opens a small menu — send in a
// message, share via the phone's share sheet, or copy the link.

export function ShareIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
  );
}

export function PaperPlaneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3L10 14" />
      <path d="M21 3l-7 18-4-7-7-4 18-7z" />
    </svg>
  );
}

const ROUND = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm";

export function LiveShareButtons({ liveId, title, text, accent = false }: { liveId: string; title: string; text: string; accent?: boolean }) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const url = () => `${window.location.origin}/live/${liveId}`;
  const canShareNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function shareNative() {
    setMenuOpen(false);
    try {
      await navigator.share({ title, text, url: url() });
    } catch {
      // dismissed
    }
  }

  async function copyLink() {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(url());
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const row = "flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[16px] hover:bg-white/[0.04]";

  return (
    <>
      {appUser && (
        <button type="button" onClick={() => setDmOpen(true)} aria-label="Send this Live in a message" title="Send in a message" className={ROUND}>
          <PaperPlaneIcon className="h-[18px] w-[18px]" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Share this Live"
        title="Share"
        className={accent ? `${ROUND} !bg-red` : ROUND}
      >
        <ShareIcon className="h-[18px] w-[18px]" />
      </button>

      {menuOpen && (
        <BottomSheet onClose={() => setMenuOpen(false)}>
          <h2 className="mb-3 font-serif text-[24px] leading-tight">Share this Live</h2>
          {appUser && (
            <button
              type="button"
              className={row}
              onClick={() => {
                setMenuOpen(false);
                setDmOpen(true);
              }}
            >
              <PaperPlaneIcon />
              Send in a message
            </button>
          )}
          {canShareNative && (
            <button type="button" className={row} onClick={shareNative}>
              <ShareIcon />
              Share to other apps…
            </button>
          )}
          <button type="button" className={row} onClick={copyLink}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
              <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
            </svg>
            Copy link
          </button>
        </BottomSheet>
      )}
      {dmOpen && <SendToChatSheet share={{ type: "LIVE", id: liveId }} onClose={() => setDmOpen(false)} />}
    </>
  );
}
