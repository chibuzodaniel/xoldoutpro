"use client";

import { useRouter } from "next/navigation";

type Props = {
  title: string;
  // Optional right-aligned slot for a page-specific action (e.g. an edit
  // or save button) — several call sites need one next to the title.
  action?: React.ReactNode;
};

// Explicit ask: every sub-page needs a way back that isn't just the
// browser/OS back gesture. Standardizes the `‹` back-arrow-plus-title bar
// pattern that a couple of pages (profile/edit, the ticket check-in page)
// already used inline, so every other page listed under "sub-pages" in
// DECISIONS.md's back-navigation entry gets the same look instead of each
// one reinventing it slightly differently.
export function BackHeader({ title, action }: Props) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-line-soft mb-6">
      <button type="button" onClick={() => router.back()} className="text-xl text-ink-2" aria-label="Back">
        ‹
      </button>
      <h1 className="font-serif text-xl flex-1 min-w-0 truncate">{title}</h1>
      {action}
    </div>
  );
}
