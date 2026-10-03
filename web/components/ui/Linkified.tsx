"use client";

import { useState } from "react";
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

// Any link typed into a post/message to somewhere other than XOLDOUT gets a
// warning before actually leaving. XOLDOUT's own links open in-app (same tab,
// client-side navigation) with no warning. A native window.confirm() blocks
// the whole tab's JS until dismissed (confirmed the hard way: it froze
// automated testing solid), which is exactly the kind of jank a real mobile
// PWA shouldn't ship either — this is a proper non-blocking bottom sheet,
// same shell as ReportSheet/InstallSheet, instead.
export function Linkified({ text, linkClassName = "underline" }: { text: string; linkClassName?: string }) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
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
            onClick={(e) => {
              e.preventDefault();
              setPendingUrl(href);
            }}
            title={href}
            className={`${linkClassName} ${WRAP}`}
          >
            {displayText(url, part)}
          </a>
        );
      })}

      {pendingUrl && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setPendingUrl(null)}
          role="presentation"
        >
          <div
            className="w-full rounded-t-2xl border-t border-line-soft bg-surface px-5 pt-6 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-1">You&apos;re leaving XOLDOUT</p>
            <p className="text-xs text-ink-3 mb-6 break-all">This link goes to {parseUrl(pendingUrl)?.hostname ?? pendingUrl}.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingUrl(null)}
                className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold text-ink-2"
              >
                Cancel
              </button>
              <a
                href={pendingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingUrl(null)}
                className="flex-1 rounded-lg bg-red px-4 py-3 text-center text-sm font-semibold text-white"
              >
                Continue
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
