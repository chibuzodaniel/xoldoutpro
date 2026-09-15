"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listDownloads, type DownloadMeta } from "@/lib/offline/downloads";
import { FallbackImg } from "@/components/ui/FallbackImg";

// Automatic collection, not a real Collection row and not server data at
// all — purely a view over this device's own local offline cache
// (lib/offline/downloads.ts, IndexedDB), so it's per-device by nature the
// same way the cache itself is. See heavy-rotation/page.tsx's own comment
// on why this is a literal-segment sibling of the [id] route.
export default function DownloadedPage() {
  const router = useRouter();
  const [downloads, setDownloads] = useState<DownloadMeta[] | null>(null);

  useEffect(() => {
    listDownloads().then((list) => setDownloads(list.sort((a, b) => b.downloadedAt - a.downloadedAt)));
  }, []);

  if (downloads === null) return null;

  return (
    <div className="px-4 py-6">
      <button type="button" onClick={() => router.back()} className="text-xl text-ink-2 mb-3" aria-label="Back">
        ‹
      </button>
      <h1 className="font-serif text-2xl mb-1">Downloaded</h1>
      <p className="text-xs text-ink-3 mb-6">
        {downloads.length} item{downloads.length === 1 ? "" : "s"} · playable offline on this device
      </p>

      {downloads.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing downloaded on this device yet — save a track for offline from Purchased.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {downloads.map((d) => (
            <Link key={d.trackId} href={`/r/${d.productId}`} className="flex items-center gap-3 py-3">
              <div className="h-11 w-11 rounded bg-surface-2 overflow-hidden shrink-0">
                <FallbackImg src={d.artworkUrl} alt={d.title} className="h-full w-full object-cover" fallback={null} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold line-clamp-1">{d.title}</p>
                <p className="text-xs text-ink-3 line-clamp-1">{d.artistName}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
