"use client";

// One-of-many chip picker for the Drop forms (v2, design/v2-prototype):
// Genre / Mood for beats, Event type, Merch category. Tap again to clear.
export function ChipPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] uppercase tracking-widest text-ink-3">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(active ? null : o)}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold ${active ? "bg-red text-white" : "border border-line bg-surface text-ink-2"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
