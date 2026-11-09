"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayer } from "@/components/player/PlayerProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { useGuestCheckout, GuestInfoCancelled, completeGuestSignIn, rememberGuestOrder, type GuestInfo } from "@/lib/useGuestCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { GuestInfoSheet } from "@/components/checkout/GuestInfoSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { downloadViaSignedLink } from "@/lib/downloadFile";
import { ChargeNote } from "@/components/currency/CurrencyProvider";
import { termRows, type LicenseTerms } from "@/lib/commerce/licenseTerms";
import { addToCart } from "@/lib/cart";

// Beat license tiers (v2, 2026-11-09). Empty = the single flat license, as before.
export type BeatLicenseOption = { id: string; name: string; priceKobo: number; formats: string[]; isExclusive: boolean; terms: LicenseTerms };

type Props = {
  productId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationSec: number;
  priceKobo: number;
  isSoldOut: boolean;
  licenses?: BeatLicenseOption[];
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Get for free";
  return `Buy · ₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function nairaAmount(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Beats go through the shared app-wide PlayerProvider/mini-player, same as
// Release tracks (PlayerProvider.play() accepts kind:"beat" and fetches
// /api/beats/[id]/audio-url instead of the track route) — this is what
// makes a beat preview survive a route change into the mini player like
// Release playback already does.
export function BeatPurchaseAndPlayer({ productId, title, artistName, artworkUrl, durationSec, priceKobo: listPriceKobo, isSoldOut, licenses = [] }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [entitled, setEntitled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Defaults true (the common case) so the button doesn't flash in then out
  // for everyone — corrected from the access response once it loads.
  const [downloadsAllowed, setDownloadsAllowed] = useState(true);
  const [serviceChargePercent, setServiceChargePercent] = useState<number | null>(null);
  // License pick + agreement. With tiers, the chosen tier's price is what's charged.
  const [licenseId, setLicenseId] = useState<string | null>(licenses[0]?.id ?? null);
  const [agreed, setAgreed] = useState(false);
  const [fullTermsFor, setFullTermsFor] = useState<string | null>(null);
  const [gettingAgreement, setGettingAgreement] = useState(false);
  const chosenLicense = licenses.find((l) => l.id === licenseId) ?? null;
  const priceKobo = chosenLicense ? chosenLicense.priceKobo : listPriceKobo;
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();
  const { guestInfoSheetOpen, pickGuestInfo, handleGuestInfoSubmit, closeGuestInfoSheet } = useGuestCheckout();

  const isThisTrack = player.current?.trackId === productId && player.current?.kind === "beat";
  const isPlaying = isThisTrack && player.isPlaying;
  const loadingAudio = isThisTrack && player.loading;

  async function loadAccess() {
    const res = await apiFetch(`/api/beats/${productId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setEntitled(data.entitled);
    setIsOwner(data.isOwner);
    setDownloadsAllowed(data.downloadsEnabled ?? true);
    setServiceChargePercent(data.serviceChargePercent ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function handleTogglePlay() {
    if (isThisTrack) {
      player.togglePlay();
      if (!isPlaying) player.setExpanded(true);
      return;
    }
    player.play({ trackId: productId, title, artistName, artworkUrl, lyricsText: null, kind: "beat", productId });
    player.setExpanded(true);
  }

  async function handleDownload() {
    // The tagging round trip on the server genuinely takes a few seconds
    // (real fetch + ffmpeg pass, not instant) — this state is what makes
    // the tap feel like it registered immediately instead of doing nothing.
    setDownloading(true);
    try {
      const res = await apiFetch(`/api/beats/${productId}/audio-url?download=1&link=1`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not download beat");
      }
      await downloadViaSignedLink(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadAgreement() {
    setGettingAgreement(true);
    try {
      const res = await apiFetch(`/api/beats/${productId}/agreement`);
      if (!res.ok) throw new Error("Could not get your license agreement");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "license.txt";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setGettingAgreement(false);
    }
  }

  async function handleBuy() {
    if (licenses.length > 0 && (!chosenLicense || !agreed)) {
      toast.error(chosenLicense ? `Tick the box to agree to the ${chosenLicense.name} license terms` : "Pick a license");
      return;
    }
    setBusy(true);
    try {
      const guest: GuestInfo | undefined = firebaseUser ? undefined : await pickGuestInfo();
      const gateway = priceKobo > 0 ? await pickGateway() : undefined;
      const res = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          productId,
          guest,
          gateway,
          ...(chosenLicense ? { licenseId: chosenLicense.id, acceptedLicenseTerms: agreed } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.customToken) await completeGuestSignIn(data.customToken);
      rememberGuestOrder(data.orderId, data.guestOrderToken);
      if (data.free) {
        await loadAccess();
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      if (err instanceof GatewayPickerCancelled || err instanceof GuestInfoCancelled) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const serviceChargeKobo = serviceChargePercent != null ? Math.round((priceKobo * serviceChargePercent) / 100) : 0;

  const canBuy = !entitled && !isOwner && !isSoldOut;

  return (
    <div>
      {canBuy && licenses.length > 0 && (
        <section className="mb-5">
          <h2 className="font-serif text-2xl font-bold">Licensing options</h2>
          <p className="mb-3 text-sm text-ink-3">Set by the producer. Review what each license allows before you buy.</p>
          <div className="flex flex-col gap-3">
            {licenses.map((l) => {
              const selected = l.id === licenseId;
              const rows = termRows(l.terms);
              const showAll = fullTermsFor === l.id;
              return (
                <div
                  key={l.id}
                  className={`rounded-2xl border p-4 ${selected ? "border-red bg-red-tint" : "border-line bg-surface"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLicenseId(l.id);
                      setAgreed(false);
                    }}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    aria-pressed={selected}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? "border-red" : "border-line-strong"}`}>
                        {selected && <span className="h-2.5 w-2.5 rounded-full bg-red" />}
                      </span>
                      <span className="text-[17px] font-bold">{l.name}</span>
                      {l.isExclusive && <span className="rounded bg-red px-1.5 py-0.5 text-[10px] font-extrabold text-white">EXCLUSIVE</span>}
                    </span>
                    <span className="font-serif text-2xl font-bold text-red-soft">{nairaAmount(l.priceKobo)}</span>
                  </button>
                  <div className="mt-2 flex gap-1.5">
                    {l.formats.map((f) => (
                      <span key={f} className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
                        {f}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-3 flex flex-col gap-1.5 text-[13px]">
                    {(showAll ? rows : rows.slice(0, 5)).map((r) => (
                      <div key={r.label} className="flex justify-between gap-3">
                        <dt className="text-ink-3">{r.label}</dt>
                        <dd className="text-right text-ink">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <button type="button" onClick={() => setFullTermsFor(showAll ? null : l.id)} className="mt-2 text-[13px] font-semibold text-red-soft">
                    {showAll ? "Hide full terms" : "Show full terms"}
                  </button>
                </div>
              );
            })}
          </div>
          {chosenLicense && (
            <label className="mt-4 flex items-start gap-3 text-[14px] text-ink-2">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-red" />
              I&apos;ve read the {chosenLicense.name} license terms and agree to them.
            </label>
          )}
        </section>
      )}
      {/* The "₦X + ₦Y service charge (N%) = ₦Z" breakdown was removed
          (explicit ask, 2026-11-07); the Buy button still shows the total. */}
      {!entitled && !isOwner && !isSoldOut && (
        <ChargeNote kobo={serviceChargePercent != null ? priceKobo + serviceChargeKobo : priceKobo} className="mb-2" />
      )}
      {/* v2: the buy row stays pinned to the bottom of the screen while the
          track list scrolls under it (design/v2-prototype). */}
      <div className="sticky bottom-0 z-10 -mx-4 mb-4 flex gap-2 border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur">
        {/* Cart (v2): the chosen license and its agreement go with the item. */}
        {!entitled && !isOwner && !isSoldOut && priceKobo > 0 && (
          <button
            type="button"
            onClick={() => {
              if (licenses.length > 0 && (!chosenLicense || !agreed)) {
                toast.error(chosenLicense ? `Tick the box to agree to the ${chosenLicense.name} license terms` : "Pick a license");
                return;
              }
              const added = addToCart({
                productId,
                type: "BEAT",
                title,
                artistName,
                imageUrl: artworkUrl,
                href: `/b/${productId}`,
                unitPriceKobo: priceKobo,
                quantity: 1,
                licenseId: chosenLicense?.id,
                licenseName: chosenLicense?.name,
                acceptedLicenseTerms: chosenLicense ? agreed : undefined,
              });
              toast.success(added ? "Added to cart" : "Already in your cart");
            }}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line px-5 py-4 text-[15px] font-bold text-ink"
          >
            Cart
          </button>
        )}
        {!entitled && !isOwner && (
          <button
            onClick={handleBuy}
            disabled={busy || isSoldOut || (licenses.length > 0 && !agreed)}
            className="flex-1 rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50"
          >
            {isSoldOut
              ? "Sold out"
              : busy
                ? "Starting checkout…"
                : chosenLicense
                  ? `Accept terms to buy · ${nairaAmount(serviceChargePercent != null ? priceKobo + serviceChargeKobo : priceKobo)}`
                  : serviceChargePercent != null && priceKobo > 0
                  ? `Buy · ${nairaAmount(priceKobo + serviceChargeKobo)}`
                  : formatNaira(priceKobo)}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
        <button
          onClick={handleTogglePlay}
          disabled={loadingAudio}
          className="h-9 w-9 rounded-full bg-red flex items-center justify-center shrink-0 disabled:opacity-50"
          aria-label={isPlaying ? "Pause" : "Play preview"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white translate-x-[1px]">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <span className="flex-1 text-sm text-ink-2 px-3">{entitled || isOwner ? "Full beat" : "Preview"}</span>
        <span className="text-xs text-ink-3">{formatTime(durationSec)}</span>
      </div>

      {(entitled || isOwner) && downloadsAllowed && (
        <div className="mt-4">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {downloading ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M12 3v13m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 20h14" strokeLinecap="round" />
              </svg>
            )}
            {downloading ? "Downloading…" : "Download"}
          </button>
          {entitled && (
            <button
              type="button"
              onClick={handleDownloadAgreement}
              disabled={gettingAgreement}
              className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {gettingAgreement ? "Preparing…" : "Download license agreement"}
            </button>
          )}
          {entitled && <p className="text-[12px] text-green mt-3">You own this beat. Your license terms are in the agreement above.</p>}
        </div>
      )}

      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
      <GuestInfoSheet open={guestInfoSheetOpen} onSubmit={handleGuestInfoSubmit} onClose={closeGuestInfoSheet} />
    </div>
  );
}
