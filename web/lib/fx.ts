import { FALLBACK_FX_RATES, SUPPORTED_CURRENCIES, type FxRates } from "@/lib/currency";

// NGN-based FX rates for display-currency conversion (lib/currency.ts).
// open.er-api.com's free tier needs no key and updates daily; Next's fetch
// cache keeps it to one upstream call per 12h per deployment. Any failure
// (network, bad payload) falls back to FALLBACK_FX_RATES rather than
// breaking every price on the site — these are display-only approximations.
const FX_URL = "https://open.er-api.com/v6/latest/NGN";
const REVALIDATE_SECONDS = 12 * 60 * 60;

export async function getNgnFxRates(): Promise<{ rates: FxRates; live: boolean }> {
  try {
    const res = await fetch(FX_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`FX ${res.status}`);
    const data: { result?: string; rates?: Record<string, number> } = await res.json();
    if (data.result !== "success" || !data.rates) throw new Error("FX bad payload");

    const rates: FxRates = { NGN: 1 };
    for (const currency of SUPPORTED_CURRENCIES) {
      const rate = data.rates[currency];
      rates[currency] = typeof rate === "number" && rate > 0 ? rate : FALLBACK_FX_RATES[currency];
    }
    return { rates, live: true };
  } catch (err) {
    console.error("getNgnFxRates failed, using fallback rates", err);
    return { rates: FALLBACK_FX_RATES, live: false };
  }
}
