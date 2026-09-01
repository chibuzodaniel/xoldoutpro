// Shared typography for the two legal documents (Privacy Policy, Terms of
// Service) — no Tailwind typography plugin installed, so styling is applied
// once here via child-element selectors instead of repeating classes on
// every <h2>/<p>/<ul> in the actual document content, keeping the page files
// themselves readable as plain semantic HTML.
export function LegalProse({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        [&>h2]:font-serif [&>h2]:text-lg [&>h2]:mt-8 [&>h2]:mb-2 [&>h2]:text-ink
        [&>h2:first-child]:mt-0
        [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mt-4 [&>h3]:mb-1.5 [&>h3]:text-ink
        [&>p]:text-sm [&>p]:text-ink-2 [&>p]:leading-relaxed [&>p]:mb-3
        [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:text-sm [&>ul]:text-ink-2 [&>ul]:leading-relaxed [&>ul]:mb-3 [&>ul]:flex [&>ul]:flex-col [&>ul]:gap-1
        [&_strong]:text-ink [&_strong]:font-semibold
        [&_a]:text-red-soft [&_a]:font-semibold
      "
    >
      {children}
    </div>
  );
}
