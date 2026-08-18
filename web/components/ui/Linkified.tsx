"use client";

import { useState } from "react";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function isExternalHost(url: string) {
  try {
    return new URL(url).hostname !== window.location.hostname;
  } catch {
    return true;
  }
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Any link typed into a post/message points off xoldout.app by definition —
// warn before actually leaving. A native window.confirm() blocks the whole
// tab's JS until dismissed (confirmed the hard way: it froze automated
// testing solid), which is exactly the kind of jank a real mobile PWA
// shouldn't ship either — this is a proper non-blocking bottom sheet, same
// shell as ReportSheet/InstallSheet, instead.
export function Linkified({ text, linkClassName = "underline" }: { text: string; linkClassName?: string }) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const parts = text.split(URL_PATTERN);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!isExternalHost(part)) return;
              e.preventDefault();
              setPendingUrl(part);
            }}
            className={linkClassName}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}

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
            <p className="text-xs text-ink-3 mb-6 break-all">This link goes to {hostnameOf(pendingUrl)}.</p>
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
