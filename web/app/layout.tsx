import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { ExpandedPlayer } from "@/components/player/ExpandedPlayer";
import { BottomNav } from "@/components/nav/BottomNav";

export const metadata: Metadata = {
  title: "XOLDOUT — Where music actually sells out",
  description: "A direct-to-fan music marketplace. Fans buy, fans own, creators get paid.",
  manifest: "/manifest.json",
  icons: {
    icon: "/xoldout-icon-transparent.png",
    shortcut: "/xoldout-icon-transparent.png",
    // Apple touch icons don't composite transparency well on the iOS home
    // screen (older iOS versions render alpha as solid black) — the
    // original opaque icon already matches the dark theme as a filled tile.
    apple: "/xoldout-icon.jpeg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0b",
};

// PlayerProvider (and the single persistent <audio> element it owns) lives
// here at the root, not inside app/(app)/layout.tsx — a track playing on,
// say, /r/[id] previously stopped dead the moment you navigated to a route
// outside the (app) group (public profile, /login, /onboarding) because the
// whole provider unmounted. Same reasoning for MiniPlayer/BottomNav: one
// shared bottom-chrome stack for the entire app, so the mini player stays
// visible and playback survives every navigation, not just within (app).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <AuthProvider>
          <PlayerProvider>
            <div className="flex flex-1 flex-col min-h-screen">
              <div className="flex-1 overflow-y-auto pb-2">{children}</div>
              <MiniPlayer />
              <BottomNav />
            </div>
            <ExpandedPlayer />
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
