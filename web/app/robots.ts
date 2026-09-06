import type { MetadataRoute } from "next";

// Nothing existed here before — search engines had no explicit crawl
// guidance or sitemap pointer for the site at all.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing behind these routes is meant to be indexed — moderation
        // tooling, account/auth flows, and API responses aren't pages a
        // search result should ever link to.
        disallow: ["/api/", "/moderation", "/login", "/signup", "/onboarding", "/reset-password"],
      },
    ],
    sitemap: "https://www.xoldout.app/sitemap.xml",
  };
}
