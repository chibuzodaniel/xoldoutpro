"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { ShareIcon } from "@/components/ui/ShareButton";
import { useToast } from "@/components/ui/ToastProvider";

// Share a product or event (explicit ask, 2026-11-11, from the user's
// screenshot): a sheet first, with the item's preview card, "Post to
// Socials" (opens the composer with the item attached, so the post shows a
// preview that links back) and "Copy or send link" (native share / copy).

export type ShareItem = {
  /** "event" items attach as events; everything else as a product. */
  type: "product" | "event";
  id: string;
  label: string; // "Music", "Beat", "Merch", "Event"
  title: string;
  subtitle: string;
  imageUrl: string | null | undefined;
  path: string;
  shareText: string;
};

export function ProductShareSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: ShareItem }) {
  const toast = useToast();
  const composeHref = `/socials?compose=1&attach=${item.type}:${item.id}&attachTitle=${encodeURIComponent(item.title)}`;

  async function sendLink() {
    const url = `${window.location.origin}${item.path}`;
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: item.title, text: item.shareText, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
      onClose();
    } catch {
      // share sheet dismissed
    }
  }

  const row = "flex w-full items-start gap-4 py-4 text-left";

  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex items-center gap-3.5 rounded-2xl border border-white/15 bg-[#0d0d0d] p-3">
          <span className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-red/50 to-black">
            {item.imageUrl && <ArtworkImage src={item.imageUrl} alt="" sizes="84px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold uppercase tracking-[0.14em] text-red-soft">{item.label}</span>
            <span className="mt-0.5 block truncate font-serif text-[21px] font-bold leading-tight">{item.title}</span>
            <span className="mt-1 block truncate text-[13px] text-ink-3">{item.subtitle}</span>
          </span>
          <Link href={item.path} onClick={onClose} className="shrink-0 rounded-full bg-red px-4 py-2.5 text-[15px] font-semibold text-white">
            {item.type === "event" ? "View event" : "View listing"}
          </Link>
        </div>

        <div className="mt-3 divide-y divide-white/10 border-t border-white/10">
          <Link href={composeHref} onClick={onClose} className={row}>
            <svg viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18 14.5c1.8.6 3 2.4 3.5 5.5" strokeLinecap="round" />
            </svg>
            <span>
              <span className="block text-[17px] font-semibold">Post to Socials</span>
              <span className="mt-1 block text-[13px] text-ink-3">Shared with a preview that links back to this {item.type === "event" ? "event" : "listing"}</span>
            </span>
          </Link>
          <button type="button" onClick={sendLink} className={row}>
            <svg viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" strokeLinecap="round" />
            </svg>
            <span className="block text-[17px] font-semibold">Copy or send link</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/** Share pill that opens the sheet (product and event pages). */
export function ProductShareButton({ item, className }: { item: ShareItem; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${className ?? ""}`}>
        <ShareIcon className="h-4 w-4" />
        Share
      </button>
      <ProductShareSheet open={open} onClose={() => setOpen(false)} item={item} />
    </>
  );
}
