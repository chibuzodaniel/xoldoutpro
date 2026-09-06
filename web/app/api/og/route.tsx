import { ImageResponse } from "next/og";

export const runtime = "edge";

const RED = "#FF2D42";
const BODY_GRAY = "#D4D4D4";

const HEADLINE = "Sell directly. Get paid. Build";
const HEADLINE_ACCENT = "your fanbase.";
const SUBHEAD =
  "XOLDOUT is the all-in-one platform for artists to sell music, beats, merch, tickets and more — directly to your fans.";

// Satori (what ImageResponse renders with) has zero access to installed
// system fonts — every font it draws with has to be handed over as raw
// bytes. Google's CSS2 endpoint serves TTF (not woff2) when fetched without
// a modern-browser User-Agent, which is exactly what a plain server-side
// fetch() looks like — the standard trick for this, not something assumed.
// Subsetting to `text` keeps the download tiny.
async function loadGoogleFont(family: string, weight: number, text: string) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl).then((res) => res.text());
  const match = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/);
  if (!match) throw new Error(`Could not resolve font file for ${family}`);
  return fetch(match[1]).then((res) => res.arrayBuffer());
}

// Deliberately styled after the signup page's hero (app/(auth)/signup) —
// same near-black background, serif headline with the closing phrase in the
// brand red, plain gray subhead — rather than inventing a new look, since
// this image's whole job is to be the first thing anyone sees when a link
// to the site is shared (WhatsApp, X, iMessage, Slack) and it should read
// as unmistakably "this app," not a generic card.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;

  const [loraBold, interBold] = await Promise.all([
    loadGoogleFont("Lora", 700, HEADLINE + HEADLINE_ACCENT),
    loadGoogleFont("Inter", 600, SUBHEAD),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#050505",
          padding: "0 90px",
        }}
      >
        {/* Real aspect ratio is 1080x720 (1.5:1, a wide wordmark, not a
            square icon) — sized to actually read at a glance on a huge
            near-black canvas, not the small header-corner size the signup
            page itself uses (which relies on sitting right next to page
            chrome for scale; this image has none). next/image can't be used
            inside ImageResponse's JSX at all — Satori only understands a
            plain <img>. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${origin}/xoldout-logo-transparent.png`} alt="" width={168} height={112} style={{ marginBottom: 32 }} />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            fontFamily: "Lora",
            fontWeight: 700,
            fontSize: 64,
            lineHeight: 1.25,
            textAlign: "center",
            color: "#FFFFFF",
          }}
        >
          <span>{HEADLINE}&nbsp;</span>
          <span style={{ color: RED }}>{HEADLINE_ACCENT}</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            maxWidth: 820,
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 28,
            lineHeight: 1.5,
            textAlign: "center",
            color: BODY_GRAY,
          }}
        >
          {SUBHEAD}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Lora", data: loraBold, weight: 700, style: "normal" },
        { name: "Inter", data: interBold, weight: 600, style: "normal" },
      ],
      // Content here never varies per-request — safe to cache hard. Crawlers
      // (WhatsApp/Facebook/X/Slack) all hit this directly to fetch the
      // preview image, so skipping the two Google Fonts round-trips on
      // every single one of those matters.
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
    },
  );
}
