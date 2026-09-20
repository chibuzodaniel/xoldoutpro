"use client";

import { PublishOptionsList } from "@/components/publish/PublishOptionsList";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Kept mounted at all times (rather than conditionally rendered) so the
// open/close transitions can actually animate — toggling classes on an
// always-present element lets it slide up from behind the FAB instead of
// popping in, and dims the page behind it instead of covering it outright.
export function PublishSheet({ open, onClose }: Props) {
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
        <h1 className="font-serif text-2xl mb-6">What are you publishing?</h1>
        <div className="mb-3">
          <PublishOptionsList onNavigate={onClose} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
