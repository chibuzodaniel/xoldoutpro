"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { PostCard, type FeedPost } from "@/components/social/PostCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/** A profile's Socials posts, newest first, loaded once (no polling). */
export function ProfilePostsFeed({ authorId }: { authorId: string }) {
  const { appUser, loading } = useAuth();
  const [posts, setPosts] = useState<(FeedPost & { repostOf?: FeedPost | null })[] | null>(null);

  useEffect(() => {
    if (!appUser) return;
    apiFetch(`/api/posts?v=2&author=${encodeURIComponent(authorId)}`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPosts(d.posts));
  }, [appUser, authorId]);

  if (!appUser && !loading) {
    return (
      <p className="px-4 py-10 text-center text-sm text-ink-3">
        <Link href="/login" className="font-semibold text-red-soft">
          Sign in
        </Link>{" "}
        to see these posts.
      </p>
    );
  }
  if (posts === null) return <LoadingSpinner full size="md" />;
  if (posts.length === 0) return <p className="px-4 py-10 text-center text-sm text-ink-3">No posts to show.</p>;
  return (
    <div className="border-t border-white/10">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post.repostOf ?? post}
          repostedBy={post.repostOf ? post.author : null}
          onDeleted={(id) => setPosts((cur) => cur?.filter((p) => p.id !== id && p.repostOf?.id !== id) ?? cur)}
        />
      ))}
    </div>
  );
}
