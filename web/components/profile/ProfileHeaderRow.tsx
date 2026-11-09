"use client";

import Image from "next/image";
import Link from "next/link";
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
export function ProfileAvatar({ targetUserId, avatarUrl, displayName }: { targetUserId: string; avatarUrl: string | null; displayName: string }) {
  const { appUser } = useAuth();
  const isOwner = appUser?.id === targetUserId;
  return (
    <ClickablePhoto targetUserId={targetUserId} kind="avatar" photoUrl={avatarUrl} alt={displayName} label="Profile photo" className="relative block">
      <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[28px] border-[3px] border-white bg-surface-2">
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <FollowButton targetUserId={targetUserId} />
      <MessageButton targetUserId={targetUserId} />
      <TipButton
        creatorId={targetUserId}
        artistName={displayName}
        className="rounded-full bg-red px-5 py-2 text-[14px] font-bold text-white"
      />
      {share}
    </div>
  );
}
