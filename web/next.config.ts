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
