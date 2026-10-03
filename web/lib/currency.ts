// Display-currency support (explicit ask: users pick their country, prices
// switch to their local currency). DISPLAY ONLY: every charge still goes
// through Bachs in NGN (lib/bachs.ts hard-codes currency "NGN"), so a
// converted price is always shown as approximate ("≈ $0.94") and checkout
// keeps stating the real ₦ amount. Isomorphic — no server imports — so the
// client CurrencyProvider and server routes share one list.

export type DisplayCountry = {
  code: DisplayCountryCode;
  name: string;
  currency: string; // ISO 4217
  flag: string;
};

export const DISPLAY_COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", flag: "🇳🇬" },
  { code: "GH", name: "Ghana", currency: "GHS", flag: "🇬🇭" },
  { code: "KE", name: "Kenya", currency: "KES", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", currency: "ZAR", flag: "🇿🇦" },
  { code: "GB", name: "United Kingdom", currency: "GBP", flag: "🇬🇧" },
  { code: "US", name: "United States", currency: "USD", flag: "🇺🇸" },
  { code: "CA", name: "Canada", currency: "CAD", flag: "🇨🇦" },
  { code: "EU", name: "Eurozone", currency: "EUR", flag: "🇪🇺" },
  { code: "OTHER", name: "Other (US dollar)", currency: "USD", flag: "🌍" },
] as const;

export type DisplayCountryCode = (typeof DISPLAY_COUNTRIES)[number]["code"];
export const DISPLAY_COUNTRY_CODES = DISPLAY_COUNTRIES.map((c) => c.code) as [DisplayCountryCode, ...DisplayCountryCode[]];
export const SUPPORTED_CURRENCIES = Array.from(new Set(DISPLAY_COUNTRIES.map((c) => c.currency)));

const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

export function displayCountryByCode(code: string | null | undefined): DisplayCountry {
  return DISPLAY_COUNTRIES.find((c) => c.code === code) ?? DISPLAY_COUNTRIES[0];
}

/** Maps a geo-IP ISO 3166 code (e.g. Vercel's x-vercel-ip-country) to a display country. Unknown/absent → Nigeria, the home market. */
export function displayCountryFromGeo(iso: string | null | undefined): DisplayCountryCode {
  if (!iso) return "NG";
  const code = iso.toUpperCase();
  if (EUROZONE.has(code)) return "EU";
  const direct = DISPLAY_COUNTRIES.find((c) => c.code === code && c.code !== "OTHER");
  return direct ? direct.code : "OTHER";
}

/** Units of each currency per 1 NGN. */
export type FxRates = Record<string, number>;

// Last-resort rates if the live FX fetch fails (lib/fx.ts) — open.er-api.com
// values as of 2026-10-03, only ever used so prices still render something sane.
export const FALLBACK_FX_RATES: FxRates = {
  NGN: 1,
  GHS: 0.008686,
  KES: 0.097586,
  ZAR: 0.0123,
  GBP: 0.000564,
  USD: 0.000753,
  CAD: 0.001053,
  EUR: 0.000659,
};

export function formatNairaKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/**
 * A kobo amount in the viewer's display currency. NGN renders exactly as
 * the rest of the app always has; anything else is an approximation,
 * prefixed "≈". Small converted amounts keep 2 decimals so ₦500 doesn't
 * round to "$0".
 */
export function formatInCurrency(kobo: number, currency: string, rates: FxRates): string {
  if (currency === "NGN") return formatNairaKobo(kobo);
  const rate = rates[currency];
  if (!rate) return formatNairaKobo(kobo);
  const amount = (kobo / 100) * rate;
  const formatted = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: amount >= 100 ? 0 : 2,
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);
  return `≈ ${formatted}`;
}
