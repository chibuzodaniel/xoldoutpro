"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { CreatePostSheet } from "@/components/social/CreatePostSheet";
import { PostCard, type FeedPost } from "@/components/social/PostCard";
import { FanbaseTab } from "@/components/groups/FanbaseTab";

type FollowedCreator = { id: string; handle: string; displayName: string; avatarUrl: string | null };

const TABS = [
  { key: "feed", label: "Feed" },
  { key: "fanbase", label: "Fanbase" },
] as const;
type SocialsTab = (typeof TABS)[number]["key"];

// "Following" is the existing suggested/relationship-based pool
// (follow/play/like/purchase signals); "For You" is genuine discovery —
// every public post from every creator with no relationship required,
// which is why PostCard shows an inline Follow button there.
const FEED_MODES = [
  { key: "following", label: "Following" },
  { key: "forYou", label: "For You" },
] as const;
type FeedMode = (typeof FEED_MODES)[number]["key"];

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
  const [tab, setTab] = useState<SocialsTab>(searchParams.get("tab") === "fanbase" ? "fanbase" : "feed");
  const [feedMode, setFeedMode] = useState<FeedMode>("following");
  const [following, setFollowing] = useState<FollowedCreator[] | null>(null);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  // BottomNav's central "+" links here with ?compose=1 while on Socials
  // (replacing the general publish sheet it opens everywhere else) — it has
  // no way to reach this page's `posts` state directly, so it hands off via
  // the URL instead. Derived straight from searchParams (which itself
  // re-renders this component on navigation) rather than synced into state
  // via an effect, so there's no setState-in-effect cascade; the param only
  // gets stripped once the sheet is actually dismissed.
  const composerOpenFromQuery = searchParams.get("compose") === "1";
  const sheetOpen = composerOpen || composerOpenFromQuery;

  function closeComposer() {
    setComposerOpen(false);
    if (composerOpenFromQuery) router.replace("/socials?tab=feed");
  }

  useEffect(() => {
    async function load() {
      setPosts(null);
      const res = await apiFetch(feedMode === "forYou" ? "/api/posts?feed=forYou" : "/api/posts");
      if (!res.ok) return;
      const data: { following: FollowedCreator[]; posts: FeedPost[] } = await res.json();
      setFollowing(data.following);
      setPosts(data.posts);
    }
    load();
  }, [feedMode]);

  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-4">Socials</h1>

      <div className="flex items-center gap-5 border-b border-line-soft mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative pb-2.5 text-[14px] font-semibold whitespace-nowrap border-b-2 transition-colors duration-200 ${
              tab === t.key ? "text-white border-red" : "text-ink-3 border-transparent hover:text-ink-2 hover:border-line"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fanbase" && <FanbaseTab />}

      {tab === "feed" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            {FEED_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setFeedMode(m.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  feedMode === m.key ? "bg-red text-white" : "bg-surface-2 text-ink-3"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-ink-3 mb-6">
            {feedMode === "forYou" ? "Discover creators across XOLDOUT, followed or not" : "Where you and the creators you follow actually talk"}
          </p>

          {feedMode === "following" && following && following.length > 0 && (
            <div className="flex gap-4 overflow-x-auto mb-6 -mx-4 px-4">
              {following.map((creator) => (
                <Link key={creator.id} href={`/u/${creator.handle}`} className="flex flex-col items-center gap-1 shrink-0 w-14">
                  <div className="h-12 w-12 rounded-full bg-surface-2 overflow-hidden">
                    {creator.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={creator.avatarUrl} alt={creator.displayName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <span className="text-[11px] text-ink-3 line-clamp-1 text-center">{creator.displayName}</span>
                </Link>
              ))}
            </div>
          )}

          {posts === null ? (
            <LoadingSpinner full size="md" />
          ) : posts.length === 0 ? (
            <p className="text-sm text-ink-3">
              {feedMode === "forYou"
                ? "Nothing to discover yet — check back once more creators start posting."
                : "Announcements from creators you follow will show up here once you start following someone."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onDeleted={(postId) => setPosts((cur) => cur?.filter((p) => p.id !== postId) ?? null)}
                />
              ))}
            </div>
          )}

          <CreatePostSheet
            open={sheetOpen}
            onClose={closeComposer}
            onPosted={(post) => setPosts((cur) => [post, ...(cur ?? [])])}
          />
        </>
      )}
    </div>
  );
}
