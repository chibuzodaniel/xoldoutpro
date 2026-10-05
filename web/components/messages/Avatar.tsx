"use client";

import { FallbackImg } from "@/components/ui/FallbackImg";

// `className` sets the size, e.g. "h-10 w-10 text-sm".
export function DmAvatar({ person, className = "h-10 w-10 text-sm" }: { person: { displayName: string; avatarUrl: string | null }; className?: string }) {
  return (
    <FallbackImg
      src={person.avatarUrl}
      alt={person.displayName}
      className={`${className} shrink-0 rounded-full object-cover`}
      fallback={
        <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-red/20 font-semibold text-red-soft`}>
          {(person.displayName.trim()[0] ?? "?").toUpperCase()}
        </span>
      }
    />
  );
}
