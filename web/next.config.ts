import type { NextConfig } from "next";

// Derived at build time from the same env var lib/storage/r2.ts uses to
// build public URLs, so this never needs to be kept in sync by hand.
function r2Hostname(): string | undefined {
  try {
    return process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname : undefined;
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(r2Hostname() ? [{ protocol: "https" as const, hostname: r2Hostname()! }] : []),
      // Google-account avatars, used when a user signs in with Google.
      { protocol: "https" as const, hostname: "lh3.googleusercontent.com" },
    ],
    // Cost-reduction pass on top of the per-component `unoptimized` fix
    // (DECISIONS.md) for whatever still goes through the optimizer (post
    // images, merch gallery, avatars/covers — genuinely unladdered uploads):
    // - webp only, not the avif+webp default — avif costs roughly double the
    //   transformations for a format gain not worth it at this quality/size.
    // - no `<Image quality=...>` call site exists anywhere in the app (every
    //   one uses the 75 default), so `qualities` is locked to just that —
    //   nothing to break, and it forecloses a future accidental multiplier.
    // - a month-long cache TTL: these URLs are immutable per-upload (a new
    //   upload gets a new random R2 key, lib/uploadImage.ts), so nothing at
    //   an existing URL ever changes underneath a cached transformation.
    formats: ["image/webp"],
    qualities: [75],
    minimumCacheTTL: 2678400,
  },
  // ffmpeg-static ships a binary it locates via __dirname at runtime; sharp
  // ships native bindings the same way. Bundling either breaks that lookup
  // (Turbopack was resolving ffmpeg-static's path to a placeholder "\ROOT\"
  // token instead of the real node_modules path) — keep them as plain
  // require()s against the real filesystem instead.
  // firebase-admin's dependency chain (jwks-rsa -> jose) mixes ESM and
  // CommonJS in a way that broke under Vercel's serverless bundling
  // (ERR_REQUIRE_ESM on every /api/auth/sync call) — same class of fix as
  // ffmpeg-static/sharp above: external packages resolve through Node's own
  // require/import instead of being bundled.
  serverExternalPackages: ["ffmpeg-static", "sharp", "firebase-admin"],
};

export default nextConfig;
