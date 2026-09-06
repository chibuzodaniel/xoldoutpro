import type { Metadata } from "next";

// Every dynamic detail page (product/profile) previously inherited the root
// layout's static site-wide metadata untouched — a shared link to a specific
// release/beat/merch/event/profile previewed as generic "XOLDOUT" branding
// in WhatsApp/iMessage/Twitter instead of that item's own title and artwork.
// One shared shape for the openGraph/twitter object; each page still runs
// its own DB query since the fields differ per type.
export function buildOgMetadata({
  title,
  description,
  imageUrl,
  path,
}: {
  title: string;
  description: string;
  imageUrl: string | null;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "XOLDOUT",
      type: "website",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

// The root URL (`/`, which immediately redirects to `/discover` —
// app/page.tsx) and `/discover` itself previously carried no metadata of
// their own, so a shared link to either one fell all the way back to the
// root layout's bare title/description with no image at all. `imageUrl`
// points at app/api/og — a real 1200x630 banner generated on the fly with
// next/og, styled after the signup page's own hero (same near-black
// background, serif headline with the closing phrase in the brand red,
// gray subhead) rather than the square app icon this used before, which
// crawlers were just cropping/padding into a plain logo card. Shared by
// both files rather than duplicated so they can never drift apart.
export function buildDiscoverMetadata(): Metadata {
  return buildOgMetadata({
    title: "XOLDOUT — Where music actually sells out",
    description: "Discover music, beats, merch, and tickets from independent artists. Fans buy, fans own, creators get paid.",
    imageUrl: "/api/og",
    path: "/discover",
  });
}
