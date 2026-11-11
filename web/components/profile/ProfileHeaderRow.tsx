"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { FollowButton } from "./FollowButton";
import { ClickablePhoto } from "./ClickablePhoto";
import { MessageButton } from "@/components/messages/MessageButton";
import { TipButton } from "@/components/product/TipButton";
import { ShareButton } from "@/components/ui/ShareButton";

// v2 public profile (design/v2-prototype, 2026-11-09). /u/[handle] is a
// cached server page and auth here is per-request bearer tokens (no session
// cookie), so "is this me?" can only be answered on the client — same reason
// as before this redesign. The owner sees the "+" badge and Edit profile;
// everyone else sees Follow / Message / Tip.

/** Centred square avatar; the owner gets the "+" (change photo) badge. */
export function ProfileAvatar({
  targetUserId,
  avatarUrl,
  displayName,
  shape = "square",
}: {
  targetUserId: string;
  avatarUrl: string | null;
  displayName: string;
  shape?: "square" | "round";
}) {
  const { appUser } = useAuth();
  const isOwner = appUser?.id === targetUserId;
  return (
    <ClickablePhoto targetUserId={targetUserId} kind="avatar" photoUrl={avatarUrl} alt={displayName} label="Profile photo" className="relative block">
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-surface-2 ${
          shape === "round" ? "h-[84px] w-[84px] rounded-full border-2 border-white/80 sm:h-24 sm:w-24" : "h-32 w-32 rounded-[28px] border-[3px] border-white"
        }`}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt={displayName} fill sizes="128px" className="object-cover" />
        ) : (
          <span className="font-serif text-4xl text-ink-3">{displayName.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      {isOwner && (
        <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-red">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white" fill="none" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </ClickablePhoto>
  );
}

/** Owner: Edit profile + Share. Visitor: Follow, Message, Tip, Share. */
export function ProfileActions({ targetUserId, handle, displayName }: { targetUserId: string; handle: string; displayName: string }) {
  const { appUser } = useAuth();
  const isOwner = appUser?.id === targetUserId;
  const share = (
    <ShareButton
      title={`${displayName} on XOLDOUT`}
      text={`Check out ${displayName} (@${handle}) on XOLDOUT`}
      path={`/u/${handle}`}
      label="Share"
      className="justify-center border border-line bg-transparent px-4 py-3 text-[14px] font-bold text-ink"
    />
  );

  if (isOwner) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Link href="/profile/edit" className="flex items-center justify-center rounded-full bg-white px-4 py-3 text-[14px] font-bold text-black">
          Edit profile
        </Link>
        {share}
      </div>
    );
  }
  // Signed-out visitors still see Follow and Message (design/v2-prototype);
  // they lead to sign-in.
  if (!appUser) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Link href="/login" className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-[14px] font-bold text-black">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M19 8v6M16 11h6" strokeLinecap="round" />
          </svg>
          Follow
        </Link>
        <Link href="/login" className="flex items-center justify-center rounded-full border border-line px-4 py-3 text-[14px] font-bold text-ink">
          Message
        </Link>
        <TipButton creatorId={targetUserId} artistName={displayName} className="rounded-full bg-red px-4 py-3 text-[14px] font-bold text-white" />
        {share}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 [&>*]:w-full [&>*]:justify-center">
      <FollowButton targetUserId={targetUserId} />
      <MessageButton targetUserId={targetUserId} />
      <TipButton creatorId={targetUserId} artistName={displayName} className="rounded-full bg-red px-4 py-3 text-[14px] font-bold text-white" />
      {share}
    </div>
  );
}

const circleBtn =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 text-white transition-colors duration-150 hover:bg-white/10";

const CupIcon = (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M4 8h12v6a5 5 0 01-5 5H9a5 5 0 01-5-5V8zM16 10h1.5a2.5 2.5 0 010 5H16" strokeLinejoin="round" />
  </svg>
);
const SendIcon = (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" strokeLinejoin="round" />
  </svg>
);

/**
 * Buttons inside the v2 profile card (user's reference, 2026-11-11):
 * visitors get "+ Follow" plus round Tip (cup) and Message (send) buttons;
 * the owner gets Edit profile plus a round Share.
 */
export function ProfileCardActions({ targetUserId, handle, displayName }: { targetUserId: string; handle: string; displayName: string }) {
  const { appUser } = useAuth();
  const isOwner = appUser?.id === targetUserId;

  if (isOwner) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/profile/edit" className="flex h-10 flex-1 items-center justify-center rounded-full bg-white text-[14px] font-semibold text-black">
          Edit profile
        </Link>
        <ShareButton
          title={`${displayName} on XOLDOUT`}
          text={`Follow me on XOLDOUT — @${handle}`}
          path={`/u/${handle}`}
          label="Share"
          className="h-10 justify-center rounded-full border border-white/30 bg-transparent px-4 text-[14px] font-semibold text-white"
        />
      </div>
    );
  }
  if (!appUser) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-red text-[14px] font-semibold text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Follow
        </Link>
        <TipButton creatorId={targetUserId} artistName={displayName} className={circleBtn} label={CupIcon} ariaLabel={`Tip ${displayName}`} />
        <Link href="/login" className={circleBtn} aria-label={`Message ${displayName}`}>
          {SendIcon}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <FollowButton targetUserId={targetUserId} size="pill" />
      <TipButton creatorId={targetUserId} artistName={displayName} className={circleBtn} label={CupIcon} ariaLabel={`Tip ${displayName}`} />
      <MessageButton targetUserId={targetUserId} className={`${circleBtn} disabled:opacity-50`} ariaLabel={`Message ${displayName}`}>
        {SendIcon}
      </MessageButton>
    </div>
  );
}

/** Round back and share buttons floating on the cover. */
export function ProfileTopBar({ handle, displayName, showBack = true }: { handle: string; displayName: string; showBack?: boolean }) {
  const router = useRouter();
  const btn = "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-4">
      {showBack ? (
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/discover"))} className={btn} aria-label="Back">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span />
      )}
      <ShareButton
        title={`${displayName} on XOLDOUT`}
        text={`Check out ${displayName} (@${handle}) on XOLDOUT`}
        path={`/u/${handle}`}
        label={`Share ${displayName}`}
        iconOnly
        className={btn}
      />
    </div>
  );
}
