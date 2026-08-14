import Link from "next/link";

const OPTIONS = [
  { title: "Upload Music", subtitle: "Single, EP, or album, free or paid", href: "/publish/music", enabled: true },
  { title: "Upload Beat", subtitle: "Beats, sample packs, drum kits, presets", enabled: false },
  { title: "Create Event", subtitle: "Concerts, listening parties, workshops", enabled: false },
  { title: "Add Merchandise", subtitle: "Apparel, posters, digital or physical goods", enabled: false },
] as const;

export default function PublishSheetPage() {
  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-6">What are you publishing?</h1>
      <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {OPTIONS.map((opt) =>
          opt.enabled ? (
            <Link key={opt.title} href={opt.href} className="flex items-center justify-between py-4">
              <div>
                <div className="text-sm font-semibold">{opt.title}</div>
                <div className="text-xs text-ink-3">{opt.subtitle}</div>
              </div>
              <span className="text-ink-3">›</span>
            </Link>
          ) : (
            <div key={opt.title} className="flex items-center justify-between py-4 opacity-40">
              <div>
                <div className="text-sm font-semibold">{opt.title}</div>
                <div className="text-xs text-ink-3">Coming soon</div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
