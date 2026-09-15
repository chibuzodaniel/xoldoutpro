"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FallbackImg } from "@/components/ui/FallbackImg";

export type UserSuggestion = { id: string; handle: string; displayName: string; avatarUrl: string | null };

const DEBOUNCE_MS = 250;

// Reusable "type a handle, pick from suggestions" input — wraps /api/search
// (creators half of it) rather than a dedicated endpoint, same data PRD §6's
// search page already uses. Debounced so every keystroke doesn't fire a
// request, and closes on selection/blur so it never lingers open.
export function UserHandleAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "@handle",
  excludeUserId,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (user: UserSuggestion) => void;
  placeholder?: string;
  excludeUserId?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim().replace(/^@/, "");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data: { creators: UserSuggestion[] } = await res.json();
      setSuggestions(data.creators.filter((c) => c.id !== excludeUserId));
      setOpen(true);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, excludeUserId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className || "flex-1 min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm"}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onSelect(u);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
            >
              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-surface-2">
                <FallbackImg src={u.avatarUrl} alt={u.displayName} className="h-full w-full object-cover" fallback={null} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{u.displayName}</p>
                <p className="truncate text-xs text-ink-3">@{u.handle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
