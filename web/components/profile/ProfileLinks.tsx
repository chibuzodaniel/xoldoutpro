import { siFacebook, siInstagram, siSoundcloud, siTiktok, siX, siYoutube } from "simple-icons";
import { visibleLinks, linkLabel, isMusicPlatform, type ProfileLink } from "@/lib/profile/links";
import { MusicPlatformLogo } from "@/components/profile/MusicPlatformLogo";

// v2 profile links (user's reference screenshots, 2026-11-11). Only
// switched-on links show, in the owner's order (lib/profile/links.ts):
// - socials, website and custom links: a row of white icons under the card;
// - music platforms: the "Links" list, one row each with logo, ▶ PLAY and ›.

const SOCIAL_PATHS: Record<string, string> = {
  X: siX.path,
  Instagram: siInstagram.path,
  YouTube: siYoutube.path,
  TikTok: siTiktok.path,
  Facebook: siFacebook.path,
  SoundCloud: siSoundcloud.path,
};

function SocialGlyph({ platform }: { platform: string }) {
  const path = SOCIAL_PATHS[platform];
  if (path) {
    return (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden>
        <path d={path} />
      </svg>
    );
  }
  if (platform === "Website") {
    return (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" strokeLinecap="round" />
    </svg>
  );
}

/** White icon row under the profile card: socials, website, custom links. */
export function ProfileLinkBadges({ links: all }: { links: ProfileLink[] }) {
  const links = visibleLinks(all).filter((l) => !isMusicPlatform(l.platform));
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-y-2">
      {links.map((link, i) => (
        <span key={`${link.platform}-${link.url}`} className="flex items-center">
          {i > 0 && <span className="h-7 w-px bg-white/30" aria-hidden />}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={linkLabel(link)}
            className="flex h-11 w-14 items-center justify-center text-white transition-opacity duration-150 hover:opacity-70"
          >
            <SocialGlyph platform={link.platform} />
          </a>
        </span>
      ))}
    </div>
  );
}

/** The "Links" list: music platforms. `manageHref` shows "Manage links" for the owner. */
export function ProfileLinkList({ links: all, manageHref }: { links: ProfileLink[]; manageHref?: string }) {
  const links = visibleLinks(all).filter((l) => isMusicPlatform(l.platform));
  if (links.length === 0 && !manageHref) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-[28px] font-bold">Links</h2>
        {manageHref && (
          <a href={manageHref} className="text-sm font-semibold text-red-soft">
            Manage links
          </a>
        )}
      </div>
      {links.length === 0 ? (
        <p className="text-sm text-ink-3">Add your Spotify, Apple Music, YouTube Music, Boomplay, Audiomack or Deezer so fans can play your music everywhere.</p>
      ) : (
        <div className="flex flex-col gap-2.5 md:max-w-2xl">
          {links.map((link) => (
            <a
              key={`${link.platform}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Play on ${linkLabel(link)}`}
              className="flex min-h-[50px] items-center gap-3 rounded-2xl border border-white/10 bg-[#111] px-4 transition-colors duration-150 hover:bg-[#181818]"
            >
              <MusicPlatformLogo platform={link.platform} />
              <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[12px] font-medium tracking-[0.12em] text-white">
                <svg viewBox="0 0 12 14" className="h-[14px] w-[12px]" aria-hidden>
                  <path d="M0 0l12 7-12 7z" fill="currentColor" />
                </svg>
                PLAY
              </span>
              <svg viewBox="0 0 24 24" className="ml-3 h-4 w-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
