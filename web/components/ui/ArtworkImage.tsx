"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Props = {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  unoptimized?: boolean;
};

// Drop-in replacement for the `{url && <Image fill .../>}` pattern used
// everywhere artwork/covers render via next/image (product/event cards,
// detail-page heroes, the mini player, post images and avatars). A missing
// `src` renders nothing, same as before — but so does a `src` that fails to
// load (a stale URL, a transient R2/network blip), which previously just
// showed a broken-image icon forever with no recovery. Either way, the
// parent's own bg-surface-2 empty-state background is what shows through.
export function ArtworkImage({ src, alt, sizes, className, priority, unoptimized }: Props) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // On a server-rendered page (every call site of this component is one)
    // the <img src> next/image renders is already in the initial HTML, so a
    // fast failure (an immediate 404, a bad host) can finish loading before
    // React hydrates and attaches onError below — confirmed with a real
    // broken URL in a browser check, not a hypothetical, and the most
    // likely to bite on the `priority` hero images that fetch eagerly
    // instead of waiting for scroll-into-view. `complete && naturalWidth
    // === 0` is the standard signature for "finished loading, but broken,"
    // and catches exactly the case onError alone would miss.
    if (ref.current?.complete && ref.current.naturalWidth === 0) setFailed(true);
  }, []);

  if (!src || failed) return null;
  return (
    <Image
      key={src}
      ref={ref}
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={unoptimized}
      priority={priority}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
