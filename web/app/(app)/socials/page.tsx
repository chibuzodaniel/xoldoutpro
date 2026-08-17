"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PostComposer } from "@/components/social/PostComposer";
import { PostCard, type FeedPost } from "@/components/social/PostCard";
import { FanbaseTab } from "@/components/groups/FanbaseTab";

type FollowedCreator = { id: string; handle: string; displayName: string; avatarUrl: string | null };

const TABS = [
  { key: "feed", label: "Feed" },
  { key: "fanbase", label: "Fanbase" },
] as const;
type SocialsTab = (typeof TABS)[number]["key"];

export default function SocialsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SocialsTab>(searchParams.get("tab") === "fanbase" ? "fanbase" : "feed");
  const [following, setFollowing] = useState<FollowedCreator[] | null>(null);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/posts");
      if (!res.ok) return;
      const data: { following: FollowedCreator[]; posts: FeedPost[] } = await res.json();
      setFollowing(data.following);
      setPosts(data.posts);
    }
    load();
  }, []);

  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-4">Socials</h1>

      <div className="flex items-center gap-5 border-b border-line-soft mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative pb-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors duration-200 ${
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
          <p className="text-xs text-ink-3 mb-6">Where you and the creators you follow actually talk</p>

          {following && following.length > 0 && (
            <div className="flex gap-4 overflow-x-auto mb-6 -mx-4 px-4">
              {following.map((creator) => (
                <Link key={creator.id} href={`/u/${creator.handle}`} className="flex flex-col items-center gap-1 shrink-0 w-14">
                  <div className="h-12 w-12 rounded-full bg-surface-2 overflow-hidden">
                    {creator.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={creator.avatarUrl} alt={creator.displayName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <span className="text-[10px] text-ink-3 line-clamp-1 text-center">{creator.displayName}</span>
                </Link>
              ))}
            </div>
          )}

          <PostComposer onPosted={(post) => setPosts((cur) => [post, ...(cur ?? [])])} />

          {posts === null ? (
            <LoadingSpinner full size="md" />
          ) : posts.length === 0 ? (
            <p className="text-sm text-ink-3">
              Announcements from creators you follow will show up here once you start following someone.
            </p>
          ) : (
            <div className="flex flex-col">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
