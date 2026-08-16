"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { FollowButton } from "./FollowButton";
import { ClickablePhoto } from "./ClickablePhoto";

type Props = {
  targetUserId: string;
  avatarUrl: string | null;
  displayName: string;
};

// A visitor's own public profile (reached via /u/[handle] from a creator
// link, search result, etc.) previously looked identical to anyone else's —
// no way to tell "this is you, edit it" from "just viewing". Owner sees the
// avatar-with-edit-badge + "Edit profile" pattern already used on the
// private /profile page; everyone else keeps the plain avatar + FollowButton.
// ClickablePhoto handles its own owner check for what tapping the avatar
// itself does (view vs. upload-new); isOwner here only decides the "+"
// badge and the Edit profile / Follow button next to it.
export function ProfileHeaderRow({ targetUserId, avatarUrl, displayName }: Props) {
  const { appUser } = useAuth();
  const isOwner = appUser?.id === targetUserId;

  return (
    <div className="flex items-end justify-between mb-3">
      <ClickablePhoto
        targetUserId={targetUserId}
        kind="avatar"
        photoUrl={avatarUrl}
        alt={displayName}
        label="Profile photo"
        className="relative block"
      >
        <div className="h-16 w-16 rounded-full border-2 border-bg bg-surface-2 overflow-hidden flex items-center justify-center">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <span className="font-serif text-lg text-ink-3">{displayName.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        {isOwner && (
          <span className="absolute bottom-0 right-0 h-5 w-5 rounded-full bg-red border-2 border-bg flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 stroke-white" fill="none" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </ClickablePhoto>

      {isOwner ? (
        <Link
          href="/profile/edit"
          className="rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Edit profile
        </Link>
      ) : (
        <FollowButton targetUserId={targetUserId} />
      )}
    </div>
  );
}
