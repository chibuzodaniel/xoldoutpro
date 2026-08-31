"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  // What to render instead of the <img> when src is missing, or the load
  // fails. Pass the same thing the call site already showed for a missing
  // src (often null) so a failed load degrades to that same look instead of
  // a broken-image icon.
  fallback: React.ReactNode;
};

// Drop-in replacement for the `{url && <img .../>}` / `{url ? <img/> :
// <fallback/>}` pattern used for the app's plain-<img> avatars and covers
// (small, fixed-size UI chrome not worth restructuring onto next/image for).
// Closes the same gap as ArtworkImage for these: a failed load now falls
// back instead of rendering a broken-image icon forever.
export function FallbackImg({ src, alt, className, fallback }: Props) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // On a server-rendered page the <img src> is already in the initial
    // HTML, so a fast failure (an immediate 404, a bad host) can finish
    // before React hydrates and attaches onError below — confirmed with a
    // real broken URL in a browser check, not a hypothetical. `complete &&
    // naturalWidth === 0` is the standard signature for "finished loading,
    // but broken," and catches exactly the case onError alone would miss.
    if (ref.current?.complete && ref.current.naturalWidth === 0) setFailed(true);
  }, []);

  if (!src || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} key={src} src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}
