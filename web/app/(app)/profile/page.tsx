"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function ProfilePage() {
  const { appUser } = useAuth();
  if (!appUser) return null;

  return (
    <div className="pb-8">
      <div
        className="h-24 bg-surface-2"
        style={appUser.coverUrl ? { backgroundImage: `url(${appUser.coverUrl})`, backgroundSize: "cover" } : undefined}
      />
      <div className="px-4 -mt-8">
        <div className="flex items-end justify-between mb-3">
          <div className="h-16 w-16 rounded-full border-2 border-bg bg-surface-2 overflow-hidden flex items-center justify-center">
            {appUser.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appUser.avatarUrl} alt={appUser.displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="font-serif text-lg text-ink-3">{appUser.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <Link href="/profile/edit" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">
            Edit profile
          </Link>
        </div>

        <h1 className="font-serif text-xl">{appUser.displayName}</h1>
        <p className="text-sm text-ink-3 mb-2">@{appUser.handle}</p>
        {appUser.bio && <p className="text-sm text-ink-2 mb-3 max-w-md">{appUser.bio}</p>}

        {appUser.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {appUser.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          <Link href="/profile/catalog" className="flex items-center justify-between py-3 text-sm">
            <span>Catalog</span>
            <span className="text-ink-3">›</span>
          </Link>
          <Link href="/wallet" className="flex items-center justify-between py-3 text-sm">
            <span>Wallet</span>
            <span className="text-ink-3">›</span>
          </Link>
          <Link href="/analytics" className="flex items-center justify-between py-3 text-sm">
            <span>Analytics</span>
            <span className="text-ink-3">›</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
