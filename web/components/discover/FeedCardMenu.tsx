"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { hideItem } from "@/lib/hiddenItems";

// The ⋮ sheet on a Discover card (v2, design/v2-prototype): Follow the
// creator, Share, See details, Not interested. Follow state is fetched once,
// only when the sheet opens for a signed-in viewer.
export function FeedCardMenu({
  open,
  onClose,
  productId,
  title,
  href,
  creator,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  title: string;
  href: string;
  creator: { id?: string; handle: string; displayName: string };
  onShare: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { appUser } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const canFollow = !!creator.id && appUser?.id !== creator.id;

  useEffect(() => {
    if (!open || !appUser || !canFollow || following !== null) return;
    apiFetch(`/api/follow?targetUserId=${creator.id}`)
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => setFollowing(Boolean(data.following)))
      .catch(() => setFollowing(false));
  }, [open, appUser, canFollow, creator.id, following]);

  async function toggleFollow() {
    if (!appUser) return router.push("/login");
    const next = !following;
    setFollowing(next);
    onClose();
    const res = await apiFetch(`/api/follow${next ? "" : `?targetUserId=${creator.id}`}`, {
      method: next ? "POST" : "DELETE",
      body: next ? JSON.stringify({ targetUserId: creator.id }) : undefined,
    }).catch(() => null);
    if (!res || !res.ok) {
      setFollowing(!next);
      return toast.error(next ? "Couldn't follow. Try again." : "Couldn't unfollow. Try again.");
    }
    toast.success(next ? `Following ${creator.displayName}` : `Unfollowed ${creator.displayName}`);
  }

  const row = "flex w-full items-center gap-3.5 px-5 py-4 text-left text-[16px] font-semibold hover:bg-surface-2";

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col">
        {canFollow && (
          <button type="button" onClick={toggleFollow} disabled={!!appUser && following === null} className={`${row} disabled:opacity-50`}>
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="10" cy="8" r="4" />
              <path d="M3 20a7 7 0 0114 0" strokeLinecap="round" />
              {following ? <path d="M17 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M20 8v6M17 11h6" strokeLinecap="round" />}
            </svg>
            {following ? `Unfollow ${creator.displayName}` : `Follow ${creator.displayName}`}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onClose();
            onShare();
          }}
          className={row}
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
          </svg>
          Share
        </button>
        <Link href={href} onClick={onClose} className={row}>
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
          </svg>
          See details
        </Link>
        <Link href={`/u/${creator.handle}`} onClick={onClose} className={row}>
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0116 0" strokeLinecap="round" />
          </svg>
          View {creator.displayName}
        </Link>
        <button
          type="button"
          onClick={() => {
            onClose();
            hideItem(productId);
            toast.success("We'll show you less like this");
          }}
          className={row}
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M5.6 5.6l12.8 12.8" strokeLinecap="round" />
          </svg>
          <span>
            Not interested
            <span className="block text-[12px] font-normal text-ink-3">We&apos;ll show you less like this</span>
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}
