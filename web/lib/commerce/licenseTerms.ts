// Beat license tiers (v2, design/v2-prototype, 2026-11-09). Zero imports so
// the publish form, the beat page and the server share one definition of a
// license's terms, the presets, and the agreement text.

export type LicenseTerms = {
  streams: number | null; // null = unlimited
  commercialUse: boolean;
  monetization: boolean;
  distribution: boolean;
  musicVideo: boolean;
  youtube: "monetized" | "allowed" | "no";
  radio: boolean;
  livePerformances: number | null; // null = unlimited
  contentId: boolean;
  durationYears: number | null; // null = perpetual
  credit: string;
};

export type LicenseDraft = { name: string; priceKobo: number; formats: string[]; isExclusive: boolean; terms: LicenseTerms };

export const LICENSE_FORMATS = ["MP3", "WAV", "Stems"] as const;

export const MAX_LICENSES = 5;

/** Starting points for the publish form — the producer edits price and terms. */
export function licensePresets(producerName: string): LicenseDraft[] {
  const credit = `Prod. by ${producerName}`;
  return [
    {
      name: "Basic",
      priceKobo: 1_500_000,
      formats: ["MP3"],
      isExclusive: false,
      terms: {
        streams: 100_000,
        commercialUse: true,
        monetization: false,
        distribution: true,
        musicVideo: false,
        youtube: "allowed",
        radio: false,
        livePerformances: 10,
        contentId: false,
        durationYears: 2,
        credit,
      },
    },
    {
      name: "Premium",
      priceKobo: 2_700_000,
      formats: ["MP3", "WAV"],
      isExclusive: false,
      terms: {
        streams: 500_000,
        commercialUse: true,
        monetization: true,
        distribution: true,
        musicVideo: true,
        youtube: "monetized",
        radio: true,
        livePerformances: null,
        contentId: false,
        durationYears: 5,
        credit,
      },
    },
    {
      name: "Exclusive",
      priceKobo: 15_000_000,
      formats: ["MP3", "WAV", "Stems"],
      isExclusive: true,
      terms: {
        streams: null,
        commercialUse: true,
        monetization: true,
        distribution: true,
        musicVideo: true,
        youtube: "monetized",
        radio: true,
        livePerformances: null,
        contentId: true,
        durationYears: null,
        credit,
      },
    },
  ];
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** The terms as label/value rows — the beat page, the agreement and the publish preview all use these. */
export function termRows(t: LicenseTerms): { label: string; value: string }[] {
  return [
    { label: "Streaming limit", value: t.streams === null ? "Unlimited" : `${t.streams.toLocaleString("en-NG")} streams` },
    { label: "Commercial use", value: yesNo(t.commercialUse) },
    { label: "Monetization", value: yesNo(t.monetization) },
    { label: "Music distribution", value: yesNo(t.distribution) },
    { label: "Music video", value: yesNo(t.musicVideo) },
    {
      label: "YouTube and social media",
      value: t.youtube === "monetized" ? "Allowed (monetized)" : t.youtube === "allowed" ? "Allowed (non-monetized)" : "Not allowed",
    },
    { label: "Radio", value: t.radio ? "Allowed" : "Not allowed" },
    { label: "Live performance", value: t.livePerformances === null ? "Unlimited" : `Up to ${t.livePerformances} shows` },
    { label: "Content ID", value: t.contentId ? "Allowed" : "Not allowed" },
    { label: "License duration", value: t.durationYears === null ? "Perpetual" : `${t.durationYears} year${t.durationYears === 1 ? "" : "s"}` },
    { label: "Producer credit", value: t.credit ? `Required: "${t.credit}"` : "Not required" },
  ];
}

function naira(kobo: number) {
  return `NGN ${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/** Plain-text license agreement generated from the snapshot on the buyer's order. */
export function agreementText(args: {
  beatTitle: string;
  producer: string;
  buyer: string;
  licenseName: string;
  formats: string[];
  isExclusive: boolean;
  terms: LicenseTerms;
  pricePaidKobo: number;
  orderId: string;
  purchasedAt: Date;
}) {
  const lines = [
    `XOLDOUT BEAT LICENSE AGREEMENT`,
    ``,
    `License: ${args.licenseName}${args.isExclusive ? " (Exclusive)" : " (Non-exclusive)"}`,
    `Beat: "${args.beatTitle}"`,
    `Producer (licensor): ${args.producer}`,
    `Licensee: ${args.buyer}`,
    `Price paid: ${naira(args.pricePaidKobo)}`,
    `Files: ${args.formats.join(", ") || "MP3"}`,
    `Order: ${args.orderId}`,
    `Date: ${args.purchasedAt.toISOString().slice(0, 10)}`,
    ``,
    `TERMS`,
    ...termRows(args.terms).map((r) => `- ${r.label}: ${r.value}`),
    ``,
    args.isExclusive
      ? `This is an exclusive license: the producer will not sell further licenses for this beat on XOLDOUT after this purchase. Licenses sold before it stay valid.`
      : `This is a non-exclusive license: the producer keeps ownership of the beat and may license it to others.`,
    `The producer keeps the copyright in the beat. The licensee may not resell, redistribute or re-license the beat file itself.`,
    `This agreement is issued through XOLDOUT under its Terms of Service (xoldout.app/legal/terms#beat-licenses).`,
  ];
  return lines.join("\n");
}
