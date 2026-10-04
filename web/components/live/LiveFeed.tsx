"use client";

import { useEffect, useRef } from "react";
import { MentionText, type ChatMention } from "@/components/live/mentions";
import { playGiftSound } from "@/components/live/giftSound";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { GiftArt, type GiftArtType } from "@/components/live/LiveIcons";
import { giftByType, GIFT_COMBO_WINDOW_MS } from "@/components/live/giftCatalog";

export type FeedItem =
  | {
      kind: "chat";
      id: string;
      senderName: string;
      text: string;
      // Host-only @-mentions (components/live/mentions.tsx).
      mentions?: ChatMention[];
      fromHost?: boolean;
      mentionsMe?: boolean;
    }
  | { kind: "system"; id: string; text: string }
  | { kind: "gift"; id: string; senderId: string; senderName: string; giftType: GiftArtType; label: string; count: number; at: number }
  | { kind: "request"; id: string; senderName: string; message: string; xgAmount: number };

export type GiftEvent = { giftId: string; giftType: GiftArtType; label: string; senderId: string; senderName: string };

/** The latest gift (for the top banner + big celebration) — `key` changes on every send so the animation replays, even mid-combo. */
export type GiftMoment = { key: string; giftType: GiftArtType; label: string; senderName: string; count: number };

/**
 * Appends a gift to the feed, stacking it onto the last row as a "×N" combo
 * when it's the same sender + same gift within GIFT_COMBO_WINDOW_MS — the
 * mockup's "You sent Grammy ×4". Returns the new feed and the resulting
 * combo count.
 */
export function appendGift(feed: FeedItem[], event: GiftEvent, now = Date.now()): { feed: FeedItem[]; count: number } {
  const last = feed[feed.length - 1];
  if (
    last?.kind === "gift" &&
    last.senderId === event.senderId &&
    last.giftType === event.giftType &&
    now - last.at < GIFT_COMBO_WINDOW_MS
  ) {
    const count = last.count + 1;
    return { feed: [...feed.slice(0, -1), { ...last, count, at: now }], count };
  }
  return {
    feed: [
      ...feed,
      {
        kind: "gift",
        id: event.giftId,
        senderId: event.senderId,
        senderName: event.senderName,
        giftType: event.giftType,
        label: event.label,
        count: 1,
        at: now,
      },
    ],
    count: 1,
  };
}

function comboSuffix(count: number) {
  return count > 1 ? ` ×${count}` : "";
}

// Chat overlay rows, bottom-anchored over the video: initials avatar, bold
// name, then text. Gift rows get the mockup's red-tinted, red-bordered pill
// with the gift's emoji at the end. Older rows fade out toward the top.
export function LiveFeed({ items, selfId }: { items: FeedItem[]; selfId: string | null }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  return (
    <div
      className="flex max-h-[38vh] flex-col gap-2 overflow-y-auto px-3 pb-2 [mask-image:linear-gradient(to_bottom,transparent,black_28%)]"
      aria-live="polite"
    >
      {items.slice(-40).map((item) => {
        if (item.kind === "system") {
          return (
            <p key={item.id} className="text-[13px] text-white/80 px-1">
              {item.text}
            </p>
          );
        }
        if (item.kind === "gift") {
          const name = item.senderId === selfId ? "You" : item.senderName;
          return (
            <p
              key={item.id}
              className="flex w-fit max-w-full items-center gap-2 rounded-full border border-red/60 bg-red/35 py-0.5 pl-0.5 pr-3 text-[15px]"
            >
              <InitialsAvatar name={item.senderName} className="h-7 w-7 text-[10px]" />
              <span className="truncate">
                <span className="font-semibold text-white">{name}</span>
                <span className="text-white/90">
                  {" "}
                  sent {item.label}
                  {comboSuffix(item.count)} {giftByType(item.giftType)?.emoji}
                </span>
              </span>
            </p>
          );
        }
        if (item.kind === "request") {
          return (
            <p
              key={item.id}
              className="flex w-fit max-w-full items-center gap-2 rounded-full border border-amber/50 bg-amber/20 py-0.5 pl-0.5 pr-3 text-[15px]"
            >
              <InitialsAvatar name={item.senderName} className="h-7 w-7 text-[10px]" />
              <span className="truncate text-white">
                <span className="font-semibold">{item.senderName}</span> requested: {item.message} · {item.xgAmount} XG
              </span>
            </p>
          );
        }
        return (
          <p
            key={item.id}
            className={`flex max-w-full items-center gap-2 text-[15px] ${
              item.mentionsMe ? "rounded-2xl border border-amber/50 bg-amber/15 py-1 pl-1 pr-3" : ""
            }`}
          >
            <InitialsAvatar name={item.senderName} className="h-7 w-7 text-[10px]" />
            <span className="min-w-0">
              <span className="font-semibold text-white">{item.senderName}</span>
              {item.fromHost && (
                <span className="ml-1.5 rounded bg-red px-1 py-px align-middle text-[10px] font-bold uppercase text-white">Host</span>
              )}{" "}
              <span className="text-white/90">
                <MentionText text={item.text} mentions={item.mentions} />
              </span>
            </span>
          </p>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// The red pill pinned under the header: "You sent Grammy ×4" / "oduya sent
// Money Spray", with the gift art on its left.
export function GiftBanner({ moment, isSelf }: { moment: GiftMoment; isSelf: boolean }) {
  return (
    <div

      className="animate-gift-banner flex w-fit max-w-[85%] items-center gap-2.5 rounded-full bg-gradient-to-r from-red to-[#8f1220] py-1.5 pl-2.5 pr-5 shadow-[0_4px_18px_-4px_rgba(225,29,46,0.6)]"
    >
      <GiftArt type={moment.giftType} className="h-6 w-6 shrink-0" />
      <span className="truncate text-[15px] text-white">
        <span className="font-bold">{isSelf ? "You" : moment.senderName}</span> sent {moment.label}
        {comboSuffix(moment.count)}
      </span>
    </div>
  );
}

const BILLS = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 92,
  delay: (i % 7) * 0.18,
  duration: 1.9 + (i % 4) * 0.35,
  rotate: ((i * 53) % 70) - 35,
}));

// The big centered moment. Money Spray rains cash bills across the whole
// stage; every other gift pops its art large in the middle with a serif
// "Grammy ×4" caption underneath.
export function GiftCelebration({ moment }: { moment: GiftMoment }) {
  // Keyed by moment.key from the caller, so this runs once per gift.
  useEffect(() => {
    playGiftSound(moment.giftType);
  }, [moment.giftType]);

  if (moment.giftType === "MONEY_SPRAY") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {BILLS.map((b, i) => (
          <span
            key={i}
            className="animate-money-fall absolute -top-16"
            style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.duration}s`, rotate: `${b.rotate}deg` }}
          >
            <GiftArt type="MONEY_SPRAY" className="h-12 w-12" />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-gift-toast" aria-hidden>
      <div className="flex flex-col items-center">
        <GiftArt type={moment.giftType} className="h-44 w-44 drop-shadow-[0_0_28px_rgba(231,179,58,0.45)]" />
        <p className="mt-1 font-serif text-[30px] text-[#f3d9a0]">
          {moment.label}
          {comboSuffix(moment.count)}
        </p>
      </div>
    </div>
  );
}
