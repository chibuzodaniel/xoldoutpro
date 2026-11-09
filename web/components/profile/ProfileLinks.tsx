import { visibleLinks, linkLabel, type ProfileLink } from "@/lib/profile/links";

// v2 profile links (design/v2-prototype, 2026-11-09): the small red-tint
// platform badges under the bio, and the "Links" list (link-in-bio) further
// down. Only switched-on links show, in the owner's order, under their
// custom title when they have one (lib/profile/links.ts).

const ABBR: Record<string, string> = {
  Instagram: "IG",
  X: "X",
  TikTok: "TT",
  YouTube: "YT",
  Spotify: "SP",
  "Apple Music": "AM",
  Audiomack: "AU",
  Boomplay: "BP",
  SoundCloud: "SC",
  Facebook: "FB",
  Website: "WWW",
  Link: "URL",
};

function abbr(platform: string) {
  return ABBR[platform] ?? platform.slice(0, 2).toUpperCase();
}

function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function Badge({ platform, size = "sm" }: { platform: string; size?: "sm" | "md" }) {
  const box = size === "md" ? "h-11 w-11 rounded-xl" : "h-10 w-10 rounded-lg";
  const text = abbr(platform).length > 2 ? "text-[10px]" : "text-[13px]";
  return (
    <span className={`${box} ${text} flex shrink-0 items-center justify-center border border-red/40 bg-red-tint font-extrabold text-white`}>{abbr(platform)}</span>
  );
}

/** Row of platform badges under the bio. */
export function ProfileLinkBadges({ links: all }: { links: ProfileLink[] }) {
  // Badges are for the platforms you're on — a custom link only shows in the list below.
  const links = visibleLinks(all).filter((l) => l.platform !== "Link");
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {links.map((link) => (
        <a key={`${link.platform}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={linkLabel(link)}>
          <Badge platform={link.platform} />
        </a>
      ))}
    </div>
  );
}

/** The "Links" list (link-in-bio). `manageHref` shows a "Manage links" link for the owner. */
export function ProfileLinkList({ links: all, manageHref }: { links: ProfileLink[]; manageHref?: string }) {
  const links = visibleLinks(all);
  if (links.length === 0 && !manageHref) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold">Links</h2>
        {manageHref && (
          <a href={manageHref} className="text-sm font-semibold text-red-soft">
            Manage links
          </a>
        )}
      </div>
      {links.length === 0 ? (
        <p className="text-sm text-ink-3">Add your Instagram, YouTube, TikTok or website so fans can find you everywhere.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {links.map((link) => (
            <a
              key={`${link.platform}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3"
            >
              <Badge platform={link.platform} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">{linkLabel(link)}</span>
                <span className="block truncate text-[13px] text-ink-3">{displayUrl(link.url)}</span>
              </span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
