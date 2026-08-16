"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </svg>
  ),
  socials: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M17 8.5a3 3 0 010 5" strokeLinecap="round" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 6h9M4 11h9M4 16h5" strokeLinecap="round" />
      <circle cx="18" cy="15.5" r="2.6" />
      <path d="M20.6 15.5V7" strokeLinecap="round" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
    </svg>
  ),
};

const ITEMS: { href: string; label: string; icon: keyof typeof ICONS; isFab: boolean }[] = [
  { href: "/discover", label: "Discover", icon: "discover", isFab: false },
  { href: "/socials", label: "Socials", icon: "socials", isFab: false },
  { href: "/publish", label: "", icon: "discover", isFab: true },
  { href: "/library", label: "Library", icon: "library", isFab: false },
  { href: "/profile", label: "Profile", icon: "profile", isFab: false },
];

// Rendered globally from the root layout (so it survives navigation
// alongside the mini player) but only makes sense on the app-shell surfaces
// it was designed for — hide it on auth/onboarding and public profile pages,
// which have never had it and aren't part of the five-tab navigation model.
const NO_NAV_EXACT = new Set(["/login", "/signup", "/onboarding"]);

function hasBottomNav(pathname: string) {
  if (NO_NAV_EXACT.has(pathname)) return false;
  if (pathname.startsWith("/u/")) return false;
  return true;
}

export function BottomNav() {
  const pathname = usePathname();
  if (!hasBottomNav(pathname ?? "")) return null;

  return (
    <nav className="sticky bottom-0 z-20 flex items-center justify-around border-t border-line bg-bg/95 backdrop-blur px-2 py-2">
      {ITEMS.map((item) =>
        item.isFab ? (
          <Link
            key={item.href}
            href={item.href}
            className="-mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-red text-white shadow-lg shadow-red/30"
            aria-label="Publish"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[18px] w-[18px]">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </Link>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 px-3 py-1 text-[10px] ${
              pathname?.startsWith(item.href) ? "text-white" : "text-ink-3"
            }`}
          >
            <span className="h-[19px] w-[19px]">{ICONS[item.icon]}</span>
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
