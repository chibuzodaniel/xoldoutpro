import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { ExpandedPlayer } from "@/components/player/ExpandedPlayer";
import { BottomNav } from "@/components/nav/BottomNav";
import { InstallGuideProvider } from "@/components/pwa/InstallGuideProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  // Lets per-page generateMetadata (product/profile detail pages) set
  // relative openGraph URLs/paths that resolve against the real domain
  // instead of localhost when building — required for those pages' shared
  // links to preview correctly instead of falling back to this generic
  // site-wide description.
  metadataBase: new URL("https://www.xoldout.app"),
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
    <html lang="en" className="h-dvh antialiased">
      {/* h-dvh (dynamic viewport height, not h-full/100%) + overflow-hidden
          caps the page at the *real* visible viewport instead of letting
          content grow it taller. Using the dvh unit specifically (rather
          than plain h-full) is what makes this reactive to the on-screen
          keyboard opening: 100% would stay anchored to the pre-keyboard
          layout height on iOS Safari, leaving BottomNav and any composer
          input (e.g. ChatComposer in a Fanbase) sitting behind the keyboard
          instead of floating up above it. dvh shrinks live as the keyboard
          opens, so this flex column reflows and pushes them up with it. */}
      <body className="h-dvh flex flex-col bg-bg text-ink overflow-hidden">
        <ToastProvider>
          <AuthProvider>
            <InstallGuideProvider>
              <PlayerProvider>
                <div className="flex h-full flex-col">
                  <div className="flex-1 min-h-0 overflow-y-auto pb-2">{children}</div>
                  <MiniPlayer />
                  <BottomNav />
                </div>
                <ExpandedPlayer />
              </PlayerProvider>
            </InstallGuideProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
