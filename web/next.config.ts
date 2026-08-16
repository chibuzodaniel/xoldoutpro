import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
