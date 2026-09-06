import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = "https://www.xoldout.app";

function hrefFor(product: { id: string; type: string; ticketTier: { eventId: string } | null }) {
  if (product.type === "BEAT") return `/b/${product.id}`;
  if (product.type === "MERCH") return `/m/${product.id}`;
  if (product.type === "EVENT" && product.ticketTier) return `/e/${product.ticketTier.eventId}`;
  return `/r/${product.id}`;
}

// Nothing existed here before — no public product or profile page was ever
// listed for search engines to find on their own. Static routes plus every
// published product/profile; small enough at this stage to not need paging
// across multiple sitemap files (Next supports that via generateSitemaps if
// the catalog outgrows a single one later).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/discover`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const [products, profiles] = await Promise.all([
    db.product.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, type: true, publishedAt: true, ticketTier: { select: { eventId: true } } },
    }),
    // Only handles with at least one published listing are worth a search
    // engine's time — an empty profile isn't a useful result.
    db.user.findMany({
      where: { deletedAt: null, products: { some: { status: "PUBLISHED" } } },
      select: { handle: true },
    }),
  ]);

  const productRoutes: MetadataRoute.Sitemap = products
    // EVENT products are one row per ticket tier — de-duplicate to one
    // sitemap entry per event, not one per tier.
    .filter((p, i, all) => p.type !== "EVENT" || all.findIndex((o) => hrefFor(o) === hrefFor(p)) === i)
    .map((p) => ({
      url: `${SITE_URL}${hrefFor(p)}`,
      lastModified: p.publishedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const profileRoutes: MetadataRoute.Sitemap = profiles.map((u) => ({
    url: `${SITE_URL}/u/${u.handle}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...productRoutes, ...profileRoutes];
}
