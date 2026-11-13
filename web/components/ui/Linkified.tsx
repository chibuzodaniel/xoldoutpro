"use client";

import Link from "next/link";

// http(s) URLs, plus bare XOLDOUT links people paste without a scheme
// ("xoldout.app/r/abc", "www.xoldout.app/e/xyz") — those were previously left
// as plain unclickable text.
const URL_PATTERN = /(https?:\/\/[^\s]+|(?:www\.)?xoldout\.app\/[^\s]*)/gi;

// Every hostname that is XOLDOUT itself. The apex and www are the same site
// (one redirects to the other), so a link to either must never trigger the
// "You're leaving XOLDOUT" sheet — previously it did whenever the link's host
// didn't exactly match the address bar (e.g. on www, a pasted
// xoldout.app/... link). The current host covers previews and local dev.
const OWN_HOSTS = new Set(["xoldout.app", "www.xoldout.app"]);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

// What a link *shows* (the href is always the full URL): host without
// "www." plus the path, with long paths cut short — a raw product URL is
// ~60 unbreakable characters and used to overflow its post card.
const MAX_LINK_CHARS = 32;
function displayText(url: URL | null, raw: string): string {
  const text = url ? `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}${url.search}` : raw;
  return text.length > MAX_LINK_CHARS ? `${text.slice(0, MAX_LINK_CHARS)}…` : text;
}

// Belt-and-braces with the shortening above: any link text may wrap at any
// character rather than push past its container.
const WRAP = "[overflow-wrap:anywhere]";

function isOwnUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  return OWN_HOSTS.has(host) || (typeof window !== "undefined" && host === window.location.hostname);
}

// Links typed into posts, bios, comments and messages. Links to other sites get
// the same "Leaving XOLDOUT" pop-up as every other link in the app
// (components/nav/ExternalLinkGuard.tsx, 2026-11-13); XOLDOUT's own links
// open in-app with no warning.
export function Linkified({ text, linkClassName = "underline" }: { text: string; linkClassName?: string }) {
  const parts = text.split(URL_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;

        const url = parseUrl(part);
        if (url && isOwnUrl(url)) {
          return (
            <Link key={i} href={`${url.pathname}${url.search}${url.hash}`} title={url.href} className={`${linkClassName} ${WRAP}`}>
              {displayText(url, part)}
            </Link>
          );
        }

        const href = url?.href ?? part;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={href}
            className={`${linkClassName} ${WRAP}`}
          >
            {displayText(url, part)}
          </a>
        );
      })}

    </>
  );
}
