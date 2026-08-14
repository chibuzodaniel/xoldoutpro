import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a binary it locates via __dirname at runtime; sharp
  // ships native bindings the same way. Bundling either breaks that lookup
  // (Turbopack was resolving ffmpeg-static's path to a placeholder "\ROOT\"
  // token instead of the real node_modules path) — keep them as plain
  // require()s against the real filesystem instead.
  serverExternalPackages: ["ffmpeg-static", "sharp"],
};

export default nextConfig;
