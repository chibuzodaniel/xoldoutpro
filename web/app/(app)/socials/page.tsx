"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { CreatePostSheet } from "@/components/social/CreatePostSheet";
import { PostCard, type FeedPost } from "@/components/social/PostCard";
import { FanbaseTab } from "@/components/groups/FanbaseTab";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { AppHeader } from "@/components/nav/AppHeader";
import { LiveNowPanel } from "@/components/live/LiveNowPanel";
import { BroadcastIcon } from "@/components/live/LiveIcons";
import { PeopleToFollow } from "@/components/social/PeopleToFollow";

type FollowedCreator = { id: string; handle: string; displayName: string; avatarUrl: string | null };

// v2 Socials (design/v2-prototype, 2026-11-09): For You / Following /
// Communities across the top. "Communities" is the existing private
// Fanbase groups (?tab=fanbase still opens it). ?tab=live still opens the
// full Live panel for old links; the main feed only shows a light "Live now"
// strip that links there, so the panel's 45s refresh never runs on the feed.
const TABS = [
  { key: "forYou", label: "For You" },
  { key: "following", label: "Following" },
  { key: "fanbase", label: "Communities" },
] as const;
type SocialsTab = (typeof TABS)[number]["key"] | "live";

export default function SocialsPage() {
  return (
    <Suspense fallback={null}>
      <SocialsPageInner />
    </Suspense>
  );
}

function SocialsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { appUser } = useAuth();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<SocialsTab>(
    initialTab === "fanbase" || initialTab === "live" || initialTab === "following" ? initialTab : "forYou",
  );
  const [following, setFollowing] = useState<FollowedCreator[] | null>(null);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const composerOpenFromQuery = searchParams.get("compose") === "1";
  const sheetOpen = composerOpen || composerOpenFromQuery;
  const isFeed = tab === "forYou" || tab === "following";

  function closeComposer() {
    setComposerOpen(false);
    if (composerOpenFromQuery) router.replace("/socials");
  }

  useEffect(() => {
    if (!isFeed) return;
    let cancelled = false;
    async function load() {
      setPosts(null);
      const res = await apiFetch(tab === "forYou" ? "/api/posts?feed=forYou" : "/api/posts");
      if (!res.ok || cancelled) return;
      const data: { following: FollowedCreator[]; posts: FeedPost[] } = await res.json();
      setFollowing(data.following);
      setPosts(data.posts);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, isFeed]);

  return (
    <div className="pb-6">
      <AppHeader />
      <div className="flex items-center gap-6 border-b border-line-soft px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative py-3 text-[16px] font-semibold whitespace-nowrap transition-colors duration-150 ${tab === t.key ? "text-white" : "text-ink-3 hover:text-ink-2"}`}
          >
            {t.label}
            {tab === t.key && <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-red" />}
          </button>
        ))}
      </div>

      <div className="px-4 pt-5">
        {tab === "fanbase" && <FanbaseTab />}

        {tab === "live" && <LiveNowPanel />}

        {isFeed && (
          <>
            {appUser && (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red/60 to-black">
                  <FallbackImg src={appUser.avatarUrl} alt={appUser.displayName} className="h-full w-full object-cover" fallback={null} />
                </span>
                <span className="flex-1 rounded-full bg-surface-2 px-4 py-3 text-[15px] text-ink-3">Share what you&apos;re hearing…</span>
                <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="1.8" />
                  <path d="M21 16l-5-5-9 9" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <div className="mt-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-serif text-2xl font-bold">
                <span className="h-2 w-2 rounded-full bg-red" aria-hidden />
                Live now
              </h2>
              <Link href="/live" className="text-sm font-semibold text-red-soft">
                See who&apos;s live ›
              </Link>
            </div>
            <div className="mt-3 flex gap-3">
              <Link href="/live/new" className="flex flex-col items-center gap-1.5">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red text-white">
                  <BroadcastIcon className="h-7 w-7" />
                </span>
                <span className="text-[12px] font-semibold">Go live</span>
              </Link>
              <Link href="/live" className="flex flex-1 items-center rounded-2xl border border-line bg-surface px-4 text-[14px] text-ink-3">
                Watch artists streaming right now, send gifts and request songs.
              </Link>
            </div>

            {tab === "forYou" && <PeopleToFollow />}

            {tab === "following" && following && following.length > 0 && (
              <div className="-mx-4 mt-6 flex gap-4 overflow-x-auto px-4 [scrollbar-width:none]">
                {following.map((creator) => (
                  <Link key={creator.id} href={`/u/${creator.handle}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                    <div className="h-14 w-14 overflow-hidden rounded-full border border-line bg-surface-2">
                      <FallbackImg src={creator.avatarUrl} alt={creator.displayName} className="h-full w-full object-cover" fallback={null} />
                    </div>
                    <span className="line-clamp-1 text-center text-[11px] text-ink-2">{creator.displayName}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-6">
              {posts === null ? (
                <LoadingSpinner full size="md" />
              ) : posts.length === 0 ? (
                <p className="rounded-2xl border border-line-soft p-6 text-center text-sm text-ink-3">
                  {tab === "forYou"
                    ? "Nothing to discover yet — check back once more creators start posting."
                    : "Posts from artists you follow show up here once you start following someone."}
                </p>
              ) : (
                <div className="gap-3 md:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} onDeleted={(postId) => setPosts((cur) => cur?.filter((p) => p.id !== postId) ?? null)} />
                  ))}
                </div>
              )}
            </div>

            <CreatePostSheet open={sheetOpen} onClose={closeComposer} onPosted={(post) => setPosts((cur) => [post, ...(cur ?? [])])} />
          </>
        )}
      </div>
    </div>
  );
}
