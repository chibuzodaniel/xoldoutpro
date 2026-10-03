"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  displayCountryByCode,
  FALLBACK_FX_RATES,
  formatInCurrency,
  formatNairaKobo,
  type DisplayCountry,
  type DisplayCountryCode,
  type FxRates,
} from "@/lib/currency";

// Which display currency prices render in, app-wide. Precedence: a signed-in
// user's saved choice (User.displayCountry) → a guest's saved choice
// (localStorage) → geo-IP detection (GET /api/currency) → Nigeria. Display
// only — see lib/currency.ts; every charge is still NGN.

const CHOICE_KEY = "xoldout.displayCountry";
const CACHE_KEY = "xoldout.fxCache"; // last detected country + rates, so a returning visitor's first paint is already converted
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type CurrencyState = {
  country: DisplayCountry;
  /** True once the user (or their account) has explicitly picked, vs auto-detected. */
  isExplicit: boolean;
  setCountry: (code: DisplayCountryCode | null) => Promise<void>;
  /** A kobo amount in the display currency ("₦1,500" or "≈ $0.98"). */
  formatPrice: (kobo: number) => string;
};

const CurrencyContext = createContext<CurrencyState | null>(null);

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode / blocked storage — the choice just won't persist for guests
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { appUser, refreshAppUser } = useAuth();
  const [rates, setRates] = useState<FxRates>(FALLBACK_FX_RATES);
  const [detected, setDetected] = useState<DisplayCountryCode>("NG");
  const [guestChoice, setGuestChoice] = useState<DisplayCountryCode | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage after mount (unavailable during SSR)
    setGuestChoice((readStorage(CHOICE_KEY) as DisplayCountryCode | null) ?? null);
    const cached = readStorage(CACHE_KEY);
    let fresh = false;
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { detectedCountry: DisplayCountryCode; rates: FxRates; fetchedAt?: number };
        setDetected(parsed.detectedCountry);
        setRates(parsed.rates);
        fresh = typeof parsed.fetchedAt === "number" && Date.now() - parsed.fetchedAt < CACHE_TTL_MS;
      } catch {
        // stale/corrupt cache — the fetch below replaces it
      }
    }
    // Rates only change daily — skip the request (a Vercel function call)
    // entirely while the cached copy is fresh.
    if (fresh) return;
    fetch("/api/currency")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { detectedCountry: DisplayCountryCode; rates: FxRates } | null) => {
        if (!data) return;
        setDetected(data.detectedCountry);
        setRates(data.rates);
        writeStorage(CACHE_KEY, JSON.stringify({ detectedCountry: data.detectedCountry, rates: data.rates, fetchedAt: Date.now() }));
      })
      .catch(() => {});
  }, []);

  const explicitCode = (appUser?.displayCountry as DisplayCountryCode | null | undefined) ?? guestChoice;
  const country = displayCountryByCode(explicitCode ?? detected);

  const setCountry = useCallback(
    async (code: DisplayCountryCode | null) => {
      setGuestChoice(code);
      writeStorage(CHOICE_KEY, code);
      if (appUser) {
        const res = await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ displayCountry: code }) });
        if (res.ok) await refreshAppUser();
      }
    },
    [appUser, refreshAppUser],
  );

  const value = useMemo<CurrencyState>(
    () => ({
      country,
      isExplicit: explicitCode != null,
      setCountry,
      formatPrice: (kobo: number) => formatInCurrency(kobo, country.currency, rates),
    }),
    [country, explicitCode, setCountry, rates],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyState {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Outside the provider (shouldn't happen under the root layout) — plain Naira.
    return { country: displayCountryByCode("NG"), isExplicit: false, setCountry: async () => {}, formatPrice: formatNairaKobo };
  }
  return ctx;
}

/**
 * Shown next to a Buy button / checkout total, only when the viewer's
 * display currency isn't NGN: the local approximation plus the exact ₦
 * amount Bachs will actually charge (their bank does the conversion).
 */
export function ChargeNote({ kobo, className = "" }: { kobo: number; className?: string }) {
  const { formatPrice, country } = useCurrency();
  if (country.currency === "NGN" || kobo <= 0) return null;
  return (
    <p className={`text-[12px] text-ink-3 ${className}`}>
      {formatPrice(kobo)} · you&apos;ll be charged {formatNairaKobo(kobo)}
    </p>
  );
}

/**
 * A buyer-facing price in the viewer's display currency. Usable from server
 * components too (it's a client leaf). Converted amounts carry the exact ₦
 * charge in a tooltip — that's what Bachs actually bills.
 */
export function Price({ kobo, freeLabel, className }: { kobo: number; freeLabel?: string; className?: string }) {
  const { formatPrice, country } = useCurrency();
  if (kobo === 0 && freeLabel) return <span className={className}>{freeLabel}</span>;
  const converted = country.currency !== "NGN";
  return (
    <span className={className} title={converted ? `Charged as ${formatNairaKobo(kobo)}` : undefined} suppressHydrationWarning>
      {formatPrice(kobo)}
    </span>
  );
}
