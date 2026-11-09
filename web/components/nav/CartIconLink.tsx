"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

// Header cart icon with an item-count badge (v2, design/v2-prototype). Reads
// this browser's cart (lib/cart.ts) — no server call.
export function CartIconLink({ className = "relative text-ink-2" }: { className?: string }) {
  const count = useCart().length;
  return (
    <Link href="/cart" aria-label={count ? `Cart, ${count} items` : "Cart"} className={className}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]" aria-hidden>
        <path d="M3 4h2l2.4 11.2a1.5 1.5 0 001.5 1.2h8.6a1.5 1.5 0 001.5-1.1L21 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9.5" cy="20" r="1.4" />
        <circle cx="17" cy="20" r="1.4" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[9px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
