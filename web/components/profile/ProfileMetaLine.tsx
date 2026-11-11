// Profile card details on ONE line (explicit ask, 2026-11-11: the card was
// too tall): location first, then tags, then anything extra (owner's edit
// button, Get Verified). Scrolls sideways instead of wrapping.
export function ProfileMetaLine({ location, tags, children }: { location?: string | null; tags: string[]; children?: React.ReactNode }) {
  if (!location && tags.length === 0 && !children) return null;
  return (
    <div className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
      {location && (
        <span className="flex max-w-[60%] shrink-0 items-center gap-1 text-[12px] text-white/75">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span className="truncate">{location}</span>
        </span>
      )}
      {location && tags.length > 0 && <span className="shrink-0 text-white/40">·</span>}
      {tags.map((tag) => (
        <span key={tag} className="shrink-0 rounded-full border border-white/25 px-2 py-px text-[11px] text-white/80">
          {tag}
        </span>
      ))}
      {children}
    </div>
  );
}
