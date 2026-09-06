import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildDiscoverMetadata } from "@/lib/og";

// Most link-preview bots (Facebook, Twitter/X, WhatsApp, Slack, iMessage)
// follow the redirect below and unfurl using /discover's own metadata
// instead — but not reliably all of them, so the root URL itself carries
// the same tags too. Metadata resolution runs independently of whether the
// component body renders or redirects, so this is emitted regardless.
export const metadata: Metadata = buildDiscoverMetadata();

// Discover is open to everyone (see app/(app)/layout.tsx) — no need to
// branch on auth state here, unlike when anonymous visitors used to be
// bounced to /login.
export default function RootPage() {
  redirect("/discover");
}
