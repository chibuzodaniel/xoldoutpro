// Inline SVG icon set for Xoldout Live — same hand-drawn-SVG convention as
// components/nav/BottomNav.tsx's ICONS (no icon library in this app). The
// gift art (GiftArt) is the illustrated, colored version from the mockup's
// gift sheet / big on-screen celebration; everything else is a currentColor
// line icon.

type IconProps = { className?: string };

export function BroadcastIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M8.2 8.2a5.4 5.4 0 000 7.6M15.8 8.2a5.4 5.4 0 010 7.6" />
      <path d="M5.3 5.3a9.5 9.5 0 000 13.4M18.7 5.3a9.5 9.5 0 010 13.4" />
    </svg>
  );
}

export function EyeIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ShieldIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function FlagIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

export function MicLineIcon({ className = "h-5 w-5", muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function FlipCameraIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 8.5A2.5 2.5 0 016.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-9z" />
      <path d="M9 12.5a3 3 0 015.3-1.9M15 13.5a3 3 0 01-5.3 1.9" />
      <path d="M14.6 9v1.8h-1.8M9.4 17v-1.8h1.8" />
    </svg>
  );
}

export function CameraOffIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 7.5A1.5 1.5 0 014.5 6H14a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0114 18H4.5A1.5 1.5 0 013 16.5v-9zM15.5 10.5L21 7v10l-5.5-3.5" />
      <path d="M2.5 3.5l19 17" />
    </svg>
  );
}

export function RefreshIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 11a8 8 0 00-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0014.3 4.6L20 16M20 20v-4h-4" />
    </svg>
  );
}

export function CloseIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// The gold "X" XG coin from the mockup (earnings row, balance chip, packs).
export function XgCoin({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#e7b33a" />
      <circle cx="12" cy="12" r="11" fill="none" stroke="#a86f12" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="#a86f12" strokeWidth="1" />
      <path d="M8.8 8.6l6.4 6.8M15.2 8.6l-6.4 6.8" stroke="#7a4f08" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export type GiftArtType = "STAR" | "MIC" | "MONEY_SPRAY" | "GRAMMY";

// Illustrated gift art — colored, not currentColor.
export function GiftArt({ type, className = "h-10 w-10" }: { type: GiftArtType; className?: string }) {
  switch (type) {
    case "STAR":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <path
            d="M24 4.5l5.9 12 13.2 1.9-9.6 9.3 2.3 13.2L24 34.7l-11.8 6.2 2.3-13.2-9.6-9.3 13.2-1.9L24 4.5z"
            fill="#e7b33a"
            stroke="#a86f12"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "MIC":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <rect x="17" y="4" width="14" height="24" rx="7" fill="#c9ccd3" stroke="#6b6f78" strokeWidth="1.5" />
          <path d="M18 11h12M18 15.5h12M18 20h12" stroke="#6b6f78" strokeWidth="1.5" />
          <path d="M11 21a13 13 0 0026 0" fill="none" stroke="#e11d2e" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M24 34v7M17 42.5h14" stroke="#e11d2e" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      );
    case "MONEY_SPRAY":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <g transform="rotate(-14 24 24)">
            <rect x="6" y="15" width="34" height="18" rx="2.5" fill="#2f8f57" stroke="#1d5f39" strokeWidth="1.5" />
            <rect x="9.5" y="18.5" width="27" height="11" rx="1.5" fill="none" stroke="#7fd6a0" strokeWidth="1" />
            <circle cx="23" cy="24" r="3.6" fill="none" stroke="#c8f2d6" strokeWidth="1.6" />
          </g>
          <g transform="rotate(8 26 30)">
            <rect x="10" y="22" width="34" height="18" rx="2.5" fill="#3fa968" stroke="#1d5f39" strokeWidth="1.5" />
            <rect x="13.5" y="25.5" width="27" height="11" rx="1.5" fill="none" stroke="#8fe2ae" strokeWidth="1" />
            <circle cx="27" cy="31" r="3.6" fill="none" stroke="#d9f7e3" strokeWidth="1.6" />
          </g>
        </svg>
      );
    case "GRAMMY":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <path d="M11 5h26c0 11-4.5 18.5-13 19.5C15.5 23.5 11 16 11 5z" fill="#e7b33a" stroke="#8a5a0c" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M15.5 8c.6 6 2.8 10.5 6.5 12.4" fill="none" stroke="#fbe3a1" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M21 24.5h6l-1 7h-4l-1-7z" fill="#d49b2a" stroke="#8a5a0c" strokeWidth="1.4" strokeLinejoin="round" />
          <ellipse cx="24" cy="33" rx="7" ry="2.4" fill="#e7b33a" stroke="#8a5a0c" strokeWidth="1.4" />
          <rect x="13" y="36" width="22" height="7" rx="2" fill="#d49b2a" stroke="#8a5a0c" strokeWidth="1.6" />
        </svg>
      );
  }
}
