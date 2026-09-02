"use client";

import { useState } from "react";
import type { GuestInfo } from "@/lib/useGuestCheckout";

type Props = {
  open: boolean;
  onSubmit: (info: GuestInfo) => void;
  onClose: () => void;
};

// Same bottom-sheet shell as GatewayPickerSheet — dims the page behind it,
// closes on backdrop click. Name + email only, on purpose: "the checkout
// must NOT require account creation, login, username, password, or profile
// completion." Email is what a guest's purchase and account end up keyed on
// (lib/commerce/guestCheckout.ts), so it's the one required field.
export function GuestInfoSheet({ open, onSubmit, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onSubmit({ name: name.trim(), email: email.trim() });
    setName("");
    setEmail("");
  }

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
        <h2 className="font-serif text-xl mb-1">Your details</h2>
        <p className="text-sm text-ink-3 mb-5">
          No account needed — we&apos;ll use this to send your purchase and keep it safe.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            required
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <button type="submit" className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white mt-1">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
