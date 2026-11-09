"use client";

import { usePathname } from "next/navigation";

// Desktop/tablet width (v2, design/v2-prototype, 2026-11-09). The app is
// built phone-first: full width on phones, and on wider screens a centred
// column instead of stretching every screen edge to edge (a full-width feed
// card at 1440px would be ~1700px tall). The moderation dashboard keeps the
// full width — its tables need it.
export const APP_COLUMN = "mx-auto w-full max-w-[640px]";

const FULL_WIDTH_PREFIXES = ["/moderation"];

export function useIsFullWidth() {
  const pathname = usePathname() ?? "";
  return FULL_WIDTH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const fullWidth = useIsFullWidth();
  return (
    <div className={`flex h-full flex-col ${fullWidth ? "w-full" : `${APP_COLUMN} md:border-x md:border-line-soft`}`}>{children}</div>
  );
}
