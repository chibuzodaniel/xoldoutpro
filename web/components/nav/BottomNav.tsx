"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; isFab: boolean }[] = [
  { href: "/home", label: "Home", isFab: false },
  { href: "/socials", label: "Socials", isFab: false },
  { href: "/publish", label: "", isFab: true },
  { href: "/library", label: "Library", isFab: false },
  { href: "/profile", label: "Profile", isFab: false },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 flex items-center justify-around border-t border-line bg-bg/95 backdrop-blur px-2 py-2">
      {ITEMS.map((item) =>
        item.isFab ? (
          <Link
            key={item.href}
            href={item.href}
            className="-mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-red text-white text-2xl leading-none shadow-lg shadow-red/30"
            aria-label="Publish"
          >
            +
          </Link>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 px-3 py-1 text-[10px] ${
              pathname?.startsWith(item.href) ? "text-white" : "text-ink-3"
            }`}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
