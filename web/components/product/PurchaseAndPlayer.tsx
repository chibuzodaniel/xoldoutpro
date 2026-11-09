"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { useGuestCheckout, GuestInfoCancelled, completeGuestSignIn, rememberGuestOrder, type GuestInfo } from "@/lib/useGuestCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { GuestInfoSheet } from "@/components/checkout/GuestInfoSheet";
import { OWNERSHIP_CHANGED_EVENT } from "@/components/addons/ReleaseExtras";
import { useToast } from "@/components/ui/ToastProvider";
import { downloadViaSignedLink } from "@/lib/downloadFile";
import { ChargeNote } from "@/components/currency/CurrencyProvider";
import { TipAmountPicker, nairaTextToKobo } from "@/components/product/TipAmountPicker";
import { TipButton } from "@/components/product/TipButton";
import { AddToCollectionSheet } from "@/components/library/AddToCollectionSheet";
import { addToCart } from "@/lib/cart";
import { PAY_WHAT_YOU_WANT_MIN_KOBO, MIN_TIP_KOBO } from "@/lib/commerce/constants";

type AccessTrack = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  durationSec: number;
  previewStartSec: number;
  previewEndSec: number;
  lyricsText: string | null;
};

type Props = {
  productId: string;
  // The release's main artist — who a standalone tip from this page pays.
  creatorId: string;
  artistName: string;
  artworkUrl: string | null;
  priceKobo: number;
  isSoldOut: boolean;
  // "Let fans pay anything": priceKobo is then the minimum, the fan picks the price.
  payWhatYouWant?: boolean;
  // For the cart line (v2 cart).
  title?: string;
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

export function PurchaseAndPlayer({ productId, creatorId, artistName, artworkUrl, priceKobo, isSoldOut, payWhatYouWant = false, title }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [entitled, setEntitled] = useState(false);
  // The buyer's purchase, for the Playlist chip (null until bought).
  const [entitlementId, setEntitlementId] = useState<string | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [tracks, setTracks] = useState<AccessTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  // Defaults true (the common case) so the button doesn't flash in then out
  // for everyone — corrected from the access response once it loads.
  const [downloadsAllowed, setDownloadsAllowed] = useState(true);
  // Creator plans (DECISIONS.md): set only when this seller is on
  // BUYER_PAYS_FEE — shown as an added "service charge" before checkout,
  // app/api/orders/route.ts charges the exact same rate on top of priceKobo.
  const [serviceChargePercent, setServiceChargePercent] = useState<number | null>(null);
  const floorKobo = payWhatYouWant ? Math.max(priceKobo, PAY_WHAT_YOU_WANT_MIN_KOBO) : priceKobo;
  const [payNaira, setPayNaira] = useState(String(floorKobo / 100));
  // "Add a tip" at checkout. Tipping with no purchase at all is the
  // separate Tip button (TipButton), always shown to fans.
  const [checkoutTipOpen, setCheckoutTipOpen] = useState(false);
  const [checkoutTipNaira, setCheckoutTipNaira] = useState("");
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();
  const { guestInfoSheetOpen, pickGuestInfo, handleGuestInfoSubmit, closeGuestInfoSheet } = useGuestCheckout();

  async function load() {
    const res = await apiFetch(`/api/products/${productId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setEntitled(data.entitled);
    setIsOwner(data.isOwner);
    setTracks(data.tracks);
    setDownloadsAllowed(data.downloadsEnabled ?? true);
    setEntitlementId(data.entitlementId ?? null);
    setServiceChargePercent(data.serviceChargePercent ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // "Buy Now" on a Discover card (v2, design/v2-prototype) lands here with
  // ?buy=1: once access has loaded, open checkout straight away (once).
  const autoBuyDone = useRef(false);
  useEffect(() => {
    if (autoBuyDone.current || tracks === null) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("buy") !== "1") return;
    autoBuyDone.current = true;
    params.delete("buy");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    if (!entitled && !isOwner && !isSoldOut && !payWhatYouWant) handleBuy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const unitKobo = payWhatYouWant ? nairaTextToKobo(payNaira) : priceKobo;
  const checkoutTipKobo = checkoutTipOpen ? nairaTextToKobo(checkoutTipNaira) : 0;

  async function handleBuy() {
    if (payWhatYouWant && unitKobo < floorKobo) {
      toast.error(`The lowest you can pay is ${nairaAmount(floorKobo)}`);
      return;
    }
    if (checkoutTipKobo > 0 && checkoutTipKobo < MIN_TIP_KOBO) {
      toast.error(`The smallest tip is ${nairaAmount(MIN_TIP_KOBO)}`);
      return;
    }
    setBusy(true);
    try {
      const guest: GuestInfo | undefined = firebaseUser ? undefined : await pickGuestInfo();
      const gateway = unitKobo + checkoutTipKobo > 0 ? await pickGateway() : undefined;
      const res = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          productId,
          guest,
          gateway,
          payAmountKobo: payWhatYouWant ? unitKobo : undefined,
          tipKobo: checkoutTipKobo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.customToken) await completeGuestSignIn(data.customToken);
      rememberGuestOrder(data.orderId, data.guestOrderToken);
      if (data.free) {
        await load();
        window.dispatchEvent(new Event(OWNERSHIP_CHANGED_EVENT));
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

  async function handleDownload(e: MouseEvent, trackId: string) {
    e.stopPropagation();
    // The tagging round trip on the server genuinely takes a few seconds
    // (real fetch + ffmpeg pass, not instant) — this state is what makes
    // the tap feel like it registered immediately instead of doing nothing.
    setDownloadingTrackId(trackId);
    try {
      const res = await apiFetch(`/api/tracks/${trackId}/audio-url?download=1&link=1`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not download track");
      }
      await downloadViaSignedLink(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingTrackId(null);
    }
  }

  function handlePlay(track: AccessTrack) {
    const trackQueue: PlayableTrack[] = (tracks ?? []).map((t) => ({
      trackId: t.id,
      title: t.title,
      artistName,
      artworkUrl,
      lyricsText: t.lyricsText,
      productId,
    }));
    player.play(
      { trackId: track.id, title: track.title, artistName, artworkUrl, lyricsText: track.lyricsText, productId },
      trackQueue,
    );
    player.setExpanded(true);
  }

  const serviceChargeKobo = serviceChargePercent != null ? Math.round((unitKobo * serviceChargePercent) / 100) : 0;
  const purchaseKobo = unitKobo + serviceChargeKobo;
  const totalKobo = purchaseKobo + checkoutTipKobo;
  const canBuy = !entitled && !isOwner && !isSoldOut;

  // Comments live under the full-screen player: open it on the first track.
  function openComments() {
    const first = tracks?.[0];
    if (!first) return;
    if (player.current?.trackId !== first.id) handlePlay(first);
    else player.setExpanded(true);
  }

  const chip = "inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-line-strong";

  return (
    <div>
      {/* v2 action chips (design/v2-prototype): Comments, Tip, Playlist. */}
      <div className="mb-5 flex flex-wrap gap-2.5">
        <button type="button" onClick={openComments} className={chip}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.2 0-2.3-.25-3.3-.7L4 20l.9-4.5A8.5 8.5 0 1121 11.5z" strokeLinejoin="round" />
          </svg>
          Comments
        </button>
        {!isOwner && (
          <TipButton
            productId={productId}
            creatorId={creatorId}
            artistName={artistName}
            label={`Tip ${artistName}`}
            className={chip}
          />
        )}
        <button
          type="button"
          onClick={() => (entitlementId ? setPlaylistOpen(true) : toast.error("Buy this first to add it to a playlist"))}
          className={chip}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 3h12v18l-6-4-6 4V3z" strokeLinejoin="round" />
          </svg>
          Playlist
        </button>
      </div>

      {canBuy && payWhatYouWant && (
        <div className="mb-3">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Name your price</label>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-sm text-ink-3">₦</span>
            <input
              type="number"
              inputMode="numeric"
              min={floorKobo / 100}
              step="1"
              aria-label="Price in naira"
              value={payNaira}
              onChange={(e) => setPayNaira(e.target.value)}
              className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
          <p className="text-[11px] text-ink-3 mt-1">
            Minimum {nairaAmount(floorKobo)}. Pay more to support {artistName}.
          </p>
        </div>
      )}
      {canBuy && (
        <div className="mb-3">
          {checkoutTipOpen ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-widest text-ink-3">Add a tip for {artistName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutTipOpen(false);
                    setCheckoutTipNaira("");
                  }}
                  className="text-xs text-ink-3"
                >
                  No tip
                </button>
              </div>
              <TipAmountPicker valueNaira={checkoutTipNaira} onChange={setCheckoutTipNaira} />
            </div>
          ) : (
            <button type="button" onClick={() => setCheckoutTipOpen(true)} className="text-xs font-semibold text-red-soft">
              + Add a tip
            </button>
          )}
        </div>
      )}
      {/* The "₦X + ₦Y service charge (N%) = ₦Z" breakdown was removed
          (explicit ask, 2026-11-07); the Buy button still shows the total. */}
      {canBuy && checkoutTipKobo > 0 && (
        <p className="text-xs text-ink-3 mb-1.5">
          {nairaAmount(purchaseKobo)} + {nairaAmount(checkoutTipKobo)} tip = {nairaAmount(totalKobo)} total
        </p>
      )}
      {canBuy && <ChargeNote kobo={totalKobo} className="mb-2" />}
      {/* v2: the buy row stays pinned to the bottom of the screen while the
          track list scrolls under it (design/v2-prototype). */}
      <div className="sticky bottom-0 z-10 -mx-4 mb-4 flex gap-2 border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur empty:hidden">
        {/* Cart (v2, design/v2-prototype): add this and pay for several items at once. */}
        {!entitled && !isOwner && !isSoldOut && unitKobo > 0 && (
          <button
            type="button"
            onClick={() => {
              if (payWhatYouWant && unitKobo < floorKobo) return toast.error(`The lowest you can pay is ${nairaAmount(floorKobo)}`);
              const added = addToCart({
                productId,
                type: "RELEASE",
                title: title ?? "Release",
                artistName,
                imageUrl: artworkUrl,
                href: `/r/${productId}`,
                unitPriceKobo: unitKobo,
                quantity: 1,
                payAmountKobo: payWhatYouWant ? unitKobo : undefined,
              });
              toast.success(added ? "Added to cart" : "Already in your cart");
            }}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line px-5 py-4 text-[15px] font-bold text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
              <path d="M3 4h2l2.4 11.2a1.5 1.5 0 001.5 1.2h8.6a1.5 1.5 0 001.5-1.1L21 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9.5" cy="20" r="1.4" />
              <circle cx="17" cy="20" r="1.4" />
            </svg>
            Cart
          </button>
        )}
        {!entitled && !isOwner && (
          <button
            onClick={handleBuy}
            disabled={busy || isSoldOut}
            className="flex-1 rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50"
          >
            {isSoldOut
              ? "Sold out"
              : busy
                ? "Starting checkout…"
                : totalKobo > 0
                  ? `Buy now · ${nairaAmount(totalKobo)}`
                  : formatNaira(0)}
          </button>
        )}
        {/* Tip is in the chips row above (standalone tip, no purchase needed). */}
      </div>

      <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {(tracks ?? []).map((track) => {
          const isThisTrack = player.current?.trackId === track.id;
          const isPlaying = isThisTrack && player.isPlaying;
          const loadingAudio = isThisTrack && player.loading;
          return (
            <div key={track.id} className="flex items-center gap-3 py-3">
              <button
                onClick={() => handlePlay(track)}
                disabled={loadingAudio}
                className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60"
              >
                <span className="h-9 w-9 rounded-full bg-red flex items-center justify-center shrink-0" aria-hidden>
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
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center text-sm">
                    <span className="truncate">{track.title}</span>
                    {!entitled && !isOwner && (
                      <span className="ml-2 shrink-0 text-[11px] text-ink-3 uppercase tracking-widest">Preview</span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-3 line-clamp-1">
                    {track.description || `Tap to preview · ${artistName}`}
                  </span>
                </span>
              </button>
              <span className="text-xs text-ink-3 shrink-0">
                {entitled || isOwner ? formatTime(track.durationSec) : formatTime(track.previewEndSec - track.previewStartSec)}
              </span>
              {(entitled || isOwner) && downloadsAllowed && (
                <button
                  onClick={(e) => handleDownload(e, track.id)}
                  disabled={downloadingTrackId === track.id}
                  aria-label={`Download ${track.title}`}
                  className="h-7 w-7 rounded-full border border-line flex items-center justify-center shrink-0 text-ink-2 disabled:opacity-60"
                >
                  {downloadingTrackId === track.id ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                      <path d="M12 3v13m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 20h14" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {entitled && (
        <p className="text-[12px] text-green mt-4">
          You own this. Playable offline once downloaded to your Library.
        </p>
      )}

      {entitlementId && <AddToCollectionSheet entitlementId={entitlementId} open={playlistOpen} onClose={() => setPlaylistOpen(false)} />}
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
      <GuestInfoSheet open={guestInfoSheetOpen} onSubmit={handleGuestInfoSubmit} onClose={closeGuestInfoSheet} />
    </div>
  );
}
