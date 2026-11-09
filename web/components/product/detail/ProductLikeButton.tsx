"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";

// ♡ next to Share on a product page (v2, design/v2-prototype). Liked state is
// read once for signed-in viewers (the same entitlements call the feed uses).
export function ProductLikeButton({ productId }: { productId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    apiFetch(`/api/me/entitlements?productIds=${encodeURIComponent(productId)}`)
      .then((res) => (res.ok ? res.json() : { liked: [] }))
      .then((data) => {
        if (!cancelled) setLiked((data.liked ?? []).includes(productId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, productId]);

  async function toggle() {
    if (!firebaseUser) return router.push("/login");
    const next = !liked;
    setLiked(next);
    const res = await apiFetch(`/api/products/${productId}/like`, { method: "POST", body: JSON.stringify({ liked: next }) }).catch(() => null);
    if (!res || !res.ok) {
      setLiked(!next);
      toast.error("Couldn't update your like");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={liked ? "Unlike" : "Like"}
      aria-pressed={liked}
      className={`mt-1 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-line ${liked ? "text-red-soft" : "text-ink"}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 20.5s-7.5-4.4-9.4-9C1.1 7.8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 2.9 1.6-1.8 3-2.9 5-2.9 3.6 0 5.9 3.3 4.4 7-1.9 4.6-9.4 9-9.4 9z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
