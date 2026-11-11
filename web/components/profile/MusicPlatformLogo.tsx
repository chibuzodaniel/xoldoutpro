import { siApplemusic, siAudiomack, siShazam, siSoundcloud, siSpotify, siTidal, siYoutubemusic } from "simple-icons";

// Music platform logos for the profile "Links" list (explicit ask,
// 2026-11-11, from the user's reference screenshot). Marks come from
// simple-icons (CC0); Boomplay and Deezer's multicolour bars aren't in it, so
// they're drawn here. Built for a dark row: wordmarks are white unless the
// brand's own wordmark is coloured (Spotify). Marks whose symbol is cut out
// of the shape (Apple Music, YouTube Music, Shazam) get a white backing so
// the cut-out reads white, like the real logos, instead of showing the row.

type Mark = { path: string; hex: string; backing?: "circle" | "square" };

const MARKS: Record<string, Mark> = {
  Spotify: { path: siSpotify.path, hex: "#1ED760" },
  "Apple Music": { path: siApplemusic.path, hex: "#FA243C", backing: "square" },
  "YouTube Music": { path: siYoutubemusic.path, hex: "#FF0000", backing: "circle" },
  Audiomack: { path: siAudiomack.path, hex: "#FFA200" },
  SoundCloud: { path: siSoundcloud.path, hex: "#FF5500" },
  Tidal: { path: siTidal.path, hex: "#FFFFFF" },
  Shazam: { path: siShazam.path, hex: "#0088FF", backing: "circle" },
};

function IconMark({ mark, size }: { mark: Mark; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      {mark.backing === "circle" && <circle cx="12" cy="12" r="9" fill="#fff" />}
      {mark.backing === "square" && <rect x="4" y="4" width="16" height="16" rx="3" fill="#fff" />}
      <path d={mark.path} fill={mark.hex} />
    </svg>
  );
}

function BoomplayMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="bp-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34E0FF" />
          <stop offset="1" stopColor="#1B6BFF" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#0B0B0B" stroke="url(#bp-ring)" strokeWidth="1.6" />
      <text x="12.4" y="17" textAnchor="middle" fontSize="14" fontWeight="900" fontStyle="italic" fill="#34E0FF" fontFamily="Arial, Helvetica, sans-serif">
        B
      </text>
    </svg>
  );
}

function DeezerMark({ size }: { size: number }) {
  // Equaliser bars, short to tall, in Deezer's colours.
  const cols = [
    { x: 0, colors: ["#FF8A00"] },
    { x: 5, colors: ["#FF5E2D", "#FF3F6E"] },
    { x: 10, colors: ["#C2187B", "#A238FF", "#8E2EEA"] },
    { x: 15, colors: ["#3A5BFF", "#2D8CFF", "#22B07D", "#2BBE4B"] },
  ];
  return (
    <svg viewBox="0 0 19 15" width={size * 1.3} height={size} aria-hidden className="shrink-0">
      {cols.map((c) =>
        c.colors.map((color, i) => <rect key={`${c.x}-${i}`} x={c.x} y={12 - i * 3.6} width="4" height="2.8" rx="0.4" fill={color} />),
      )}
    </svg>
  );
}

// Compact row form (user's reference): small mark, then the name. Spotify's
// name is in its green like the real wordmark; YouTube Music reads "Music"
// next to its mark, as in the reference.
const NAME: Record<string, { text: string; className?: string }> = {
  Spotify: { text: "Spotify", className: "text-[#1ED760]" },
  "YouTube Music": { text: "Music" },
};

export function MusicPlatformLogo({ platform }: { platform: string }) {
  const name = NAME[platform] ?? { text: platform };
  const mark = MARKS[platform];
  return (
    <span className="flex min-w-0 items-center gap-3 leading-none" aria-label={platform}>
      {platform === "Boomplay" ? (
        <BoomplayMark size={28} />
      ) : platform === "Deezer" ? (
        <DeezerMark size={16} />
      ) : mark ? (
        <IconMark mark={mark} size={platform === "Audiomack" ? 24 : 28} />
      ) : null}
      <span aria-hidden className={`truncate text-[15px] ${name.className ?? "text-white"}`}>
        {name.text}
      </span>
    </span>
  );
}
