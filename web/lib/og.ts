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
