import { NextRequest, NextResponse } from "next/server";
import { displayCountryFromGeo } from "@/lib/currency";
import { getNgnFxRates } from "@/lib/fx";

// Public — what CurrencyProvider needs on load: the geo-detected display
// country (Vercel's x-vercel-ip-country; absent locally → Nigeria) and the
// NGN-based FX rates. A signed-in user's saved choice (User.displayCountry,
// via GET /api/me) overrides the detected one client-side.
export async function GET(req: NextRequest) {
  const { rates, live } = await getNgnFxRates();
  return NextResponse.json({
    detectedCountry: displayCountryFromGeo(req.headers.get("x-vercel-ip-country")),
    rates,
    live,
  });
}
