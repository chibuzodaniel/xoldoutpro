import type { MetadataRoute } from "next";

// Nothing existed here before — search engines had no explicit crawl
// guidance or sitemap pointer for the site at all.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // /api/og is the generated link-preview banner (lib/og.ts) — link
        // unfurlers (Instagram/Facebook/WhatsApp's facebookexternalhit,
        // X, LinkedIn) honor robots.txt, so the blanket /api/ disallow below
        // was hiding the preview image from them. The more specific Allow
        // wins over Disallow: /api/ under longest-match rules.
        allow: ["/", "/api/og"],
        // Nothing behind these routes is meant to be indexed — moderation
        // tooling, account/auth flows, and API responses aren't pages a
        // search result should ever link to.
        disallow: ["/api/", "/moderation", "/login", "/signup", "/onboarding", "/reset-password"],
      },
    ],
    sitemap: "https://www.xoldout.app/sitemap.xml",
  };
}
