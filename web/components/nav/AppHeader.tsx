import Link from "next/link";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-bg/95 backdrop-blur border-b border-line-soft">
      <Link href="/discover" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xoldout-icon.jpeg" alt="" className="h-6 w-6 rounded-md" />
        <span className="font-sans font-extrabold tracking-tight text-[15px]">XOLDOUT</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/search" aria-label="Search" className="text-ink-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
          </svg>
        </Link>
        <span className="text-ink-2" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 20a2 2 0 004 0" strokeLinecap="round" />
          </svg>
        </span>
      </div>
    </header>
  );
}
