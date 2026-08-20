"use client";

import { PostComposer } from "./PostComposer";
import type { FeedPost } from "./PostCard";

type Props = { open: boolean; onClose: () => void; onPosted: (post: FeedPost) => void };

// Same bottom-sheet shell as CreateFanbaseSheet — the Feed composer moved
// out of the always-visible top-of-list slot into a FAB-triggered modal, to
// match the reference's "float + button" pattern instead of a form that's
// always taking up space above the posts.
export function CreatePostSheet({ open, onClose, onPosted }: Props) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <h1 className="font-serif text-2xl mb-5">New post</h1>

        <PostComposer
          className=""
          onPosted={(post) => {
            onPosted(post);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
