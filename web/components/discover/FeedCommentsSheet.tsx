"use client";

import { SongComments } from "@/components/player/SongComments";
import { BottomSheet } from "@/components/ui/BottomSheet";

// Feed comments (v2, design/v2-prototype): tapping 💬 on a Discover card slides
// a sheet half-way up with every comment and a pinned "Add a comment" box.
// Comments load once when it opens — never polled (web/CLAUDE.md).
export function FeedCommentsSheet({
  open,
  onClose,
  title,
  kind,
  trackId,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kind: "track" | "beat" | "product";
  trackId: string;
  onPosted?: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${title}`} height="half">
      {open && <SongComments kind={kind} trackId={trackId} listVisible layout="sheet" onPosted={onPosted} />}
    </BottomSheet>
  );
}
