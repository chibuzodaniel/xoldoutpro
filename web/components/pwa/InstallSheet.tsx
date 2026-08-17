"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  ready: boolean;
  installed: boolean;
  ios: boolean;
  canInstall: boolean;
  onInstallClick: () => void;
};

// PRD §16/§19: an installable PWA needs an install guide as a launch
// requirement regardless of store distribution. Same bottom-sheet shell as
// PublishSheet/ReportSheet — floats up from under, dims the page behind it
// rather than covering it outright. Purely presentational: platform
// detection and the captured `beforeinstallprompt` event live in
// InstallGuideProvider, which listens from app load (not from sheet-open —
// see that file for why that distinction matters).
export function InstallSheet({ open, onClose, ready, installed, ios, canInstall, onInstallClick }: Props) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <p className="text-[11px] tracking-[0.22em] uppercase text-red font-semibold mb-4">Install XOLDOUT</p>

        {!ready ? (
          <div className="h-32" />
        ) : installed ? (
          <>
            <h1 className="font-serif text-2xl mb-3">You&apos;re set.</h1>
            <p className="text-sm text-ink-3 mb-6">XOLDOUT is installed. Open it from your home screen any time.</p>
            <button type="button" onClick={onClose} className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white">
              Done
            </button>
          </>
        ) : ios ? (
          <>
            <h1 className="font-serif text-2xl mb-3">Add to your home screen</h1>
            <p className="text-sm text-ink-3 mb-5">Offline playback and the fastest access both need this — it takes ten seconds.</p>
            <ol className="flex flex-col gap-3 mb-6">
              <li className="flex items-center gap-3 text-sm text-ink-2">
                <span className="h-7 w-7 rounded-full border border-line flex items-center justify-center shrink-0 text-xs font-semibold">
                  1
                </span>
                Tap the Share icon
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 3v13M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                in Safari&apos;s toolbar
              </li>
              <li className="flex items-center gap-3 text-sm text-ink-2">
                <span className="h-7 w-7 rounded-full border border-line flex items-center justify-center shrink-0 text-xs font-semibold">
                  2
                </span>
                Scroll down and tap <span className="font-semibold text-ink">Add to Home Screen</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-ink-2">
                <span className="h-7 w-7 rounded-full border border-line flex items-center justify-center shrink-0 text-xs font-semibold">
                  3
                </span>
                Tap <span className="font-semibold text-ink">Add</span> to confirm
              </li>
            </ol>
          </>
        ) : canInstall ? (
          <>
            <h1 className="font-serif text-2xl mb-3">Install the app</h1>
            <p className="text-sm text-ink-3 mb-6">Offline playback and the fastest access both need this — it takes ten seconds.</p>
            <button
              type="button"
              onClick={onInstallClick}
              className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
            >
              Install now
            </button>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl mb-3">Install the app</h1>
            <p className="text-sm text-ink-3 mb-6">
              Look for <span className="font-semibold text-ink">Install app</span> or{" "}
              <span className="font-semibold text-ink">Add to Home Screen</span> in your browser&apos;s menu.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
