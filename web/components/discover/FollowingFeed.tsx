"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OwnedBadgesProvider } from "@/components/product/OwnedBadges";
import { FeedCard, type FeedCardProduct } from "@/components/discover/FeedCard";

// v2 Discover → Following: needs the signed-in user, so it's fetched on the
// client (the rest of Discover is a cached server page). One request when
// the tab opens; no polling.
export function FollowingFeed() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ followsAnyone: boolean; products: FeedCardProduct[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    apiFetch("/api/discover/following")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  if (authLoading) return <LoadingSpinner full />;

  if (!firebaseUser) {
    return (
      <Empty title="See what your artists drop" body="Sign in and follow artists to get their new music, beats and merch here.">
        <Link href="/login" className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
          Sign in
        </Link>
      </Empty>
    );
  }
  if (failed) return <Empty title="Couldn't load your feed" body="Check your connection and try again." />;
  if (!data) return <LoadingSpinner full />;
  if (!data.followsAnyone) {
    return (
      <Empty title="You're not following anyone yet" body="Follow artists you love and their new drops will show up here.">
        <Link href="/discover?feed=charts" className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
          Find artists in Charts
        </Link>
      </Empty>
    );
  }
  if (data.products.length === 0) return <Empty title="Nothing new yet" body="The artists you follow haven't dropped anything yet." />;

  return (
    <OwnedBadgesProvider productIds={data.products.map((p) => p.id)}>
      <div className="flex flex-col gap-5 px-4 pt-5">
        {data.products.map((p, i) => (
          <FeedCard key={p.id} product={p} priority={i === 0} />
        ))}
      </div>
    </OwnedBadgesProvider>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
      <p className="font-serif text-2xl font-bold">{title}</p>
      <p className="text-sm text-ink-3">{body}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
