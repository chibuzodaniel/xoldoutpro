import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
