"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberPath } from "@/lib/returnTo";

/** Remembers the page you're on, so signing in/up brings you back (lib/returnTo.ts). */
export function ReturnToTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (pathname) rememberPath(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
  return null;
}
