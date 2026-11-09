"use client";

import { useState } from "react";

// Merch sizes & colours on the publish form (v2, 2026-11-09). Sellers pick
// sizes and add colours; every size × colour combination becomes an option
// with optional stock of its own. Nothing picked = a plain listing, as before.

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export type VariantDraft = { size: string | null; color: string | null; stock: string };

export type VariantsState = { sizes: string[]; colors: string[]; stock: Record<string, string> };

export const emptyVariants: VariantsState = { sizes: [], colors: [], stock: {} };

function comboKey(size: string | null, color: string | null) {
  return `${size ?? ""}|${color ?? ""}`;
}

/** Every option the seller set up, in a stable order. */
export function variantCombos(state: VariantsState): { size: string | null; color: string | null; key: string }[] {
  const sizes: (string | null)[] = state.sizes.length ? state.sizes : [null];
  const colors: (string | null)[] = state.colors.length ? state.colors : [null];
  if (!state.sizes.length && !state.colors.length) return [];
  return sizes.flatMap((size) => colors.map((color) => ({ size, color, key: comboKey(size, color) })));
}

/** The /api/merch payload, or an error message. */
export function variantsPayload(state: VariantsState): { variants: { size: string | null; color: string | null; cap: number | null }[] } | { error: string } {
  const variants = [];
  for (const c of variantCombos(state)) {
    const raw = (state.stock[c.key] ?? "").trim();
    const cap = raw ? Number(raw) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap <= 0)) return { error: "Stock for each option must be a whole number above 0, or left blank" };
    variants.push({ size: c.size, color: c.color, cap });
  }
  if (variants.length > 60) return { error: "That's too many combinations — keep it to 60 or fewer" };
  return { variants };
}

export function VariantsEditor({ value, onChange }: { value: VariantsState; onChange: (v: VariantsState) => void }) {
  const [customSize, setCustomSize] = useState("");
  const [color, setColor] = useState("");
  const combos = variantCombos(value);

  function toggleSize(size: string) {
    const sizes = value.sizes.includes(size) ? value.sizes.filter((s) => s !== size) : [...value.sizes, size];
    onChange({ ...value, sizes });
  }

  function addCustomSize() {
    const s = customSize.trim().slice(0, 24);
    if (!s || value.sizes.includes(s)) return;
    onChange({ ...value, sizes: [...value.sizes, s] });
    setCustomSize("");
  }

  function addColor() {
    const c = color.trim().slice(0, 24);
    if (!c || value.colors.includes(c)) return;
    onChange({ ...value, colors: [...value.colors, c] });
    setColor("");
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${on ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"}`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-2 text-xs text-ink-3">Sizes</p>
        <div className="flex flex-wrap gap-2">
          {[...STANDARD_SIZES, ...value.sizes.filter((s) => !STANDARD_SIZES.includes(s))].map((s) => (
            <button key={s} type="button" onClick={() => toggleSize(s)} className={chip(value.sizes.includes(s))}>
              {s}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customSize}
            onChange={(e) => setCustomSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSize();
              }
            }}
            placeholder="Other size (e.g. 42, One size)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-red"
          />
          <button type="button" onClick={addCustomSize} className="rounded-lg border border-line px-3 text-sm font-semibold">
            Add
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-ink-3">Colours</p>
        <div className="flex flex-wrap gap-2">
          {value.colors.map((c) => (
            <button key={c} type="button" onClick={() => onChange({ ...value, colors: value.colors.filter((x) => x !== c) })} className={chip(true)}>
              {c} ×
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addColor();
              }
            }}
            placeholder="Add a colour (e.g. Black)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-red"
          />
          <button type="button" onClick={addColor} className="rounded-lg border border-line px-3 text-sm font-semibold">
            Add
          </button>
        </div>
      </div>

      {combos.length > 0 && (
        <div className="rounded-xl border border-line-soft">
          <p className="border-b border-line-soft px-3 py-2 text-xs text-ink-3">Stock per option (leave blank for no limit)</p>
          {combos.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 border-b border-line-soft px-3 py-2 last:border-b-0">
              <span className="text-sm">{[c.size, c.color].filter(Boolean).join(" · ")}</span>
              <input
                type="number"
                min={1}
                step="1"
                inputMode="numeric"
                value={value.stock[c.key] ?? ""}
                onChange={(e) => onChange({ ...value, stock: { ...value.stock, [c.key]: e.target.value } })}
                placeholder="∞"
                aria-label={`Stock for ${[c.size, c.color].filter(Boolean).join(" ")}`}
                className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-red"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
