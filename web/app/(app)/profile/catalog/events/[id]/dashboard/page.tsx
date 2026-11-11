"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Event host dashboard (explicit ask, 2026-11-11): ticket sales by type,
// per-buyer limits, the promoter programme (pay, applications, performance)
// and discounts. Loaded once when opened; refreshed after each change.

type Data = {
  event: {
    id: string;
    title: string;
    startsAt: string;
    promotersOpen: boolean;
    promoterPayType: "PERCENT" | "FLAT";
    promoterMinPercent: number;
    promoterMaxPercent: number;
    promoterFlatKobo: number;
    maxPerBuyer: number | null;
  };
  tiers: { productId: string; name: string; priceKobo: number; cap: number | null; sold: number; grossKobo: number; maxPerBuyer: number | null; onSale: boolean }[];
  discounts: {
    id: string;
    name: string;
    code: string | null;
    kind: "PERCENT" | "FLAT";
    value: number;
    isEarlyBird: boolean;
    startsAt: string | null;
    expiresAt: string | null;
    maxUses: number | null;
    tierIds: string[];
    active: boolean;
    uses: number;
    totalOffKobo: number;
  }[];
  promoters: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    sharePercent: number;
    clickCount: number;
    tickets: number;
    earnedKobo: number;
    user: { handle: string; displayName: string };
  }[];
};

const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const card = "rounded-2xl border border-white/10 bg-[#0f0f0f] p-4";
const input = "rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-red";
const h2 = "mb-3 text-[17px] font-bold";
const toKobo = (s: string) => Math.round(parseFloat(s || "0") * 100);
const numOrNull = (s: string) => (s.trim() ? Math.floor(Number(s)) : null);

export default function EventDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { appUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Settings drafts
  const [eventLimit, setEventLimit] = useState("");
  const [tierLimits, setTierLimits] = useState<Record<string, string>>({});
  const [promOpen, setPromOpen] = useState(false);
  const [payType, setPayType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [minPct, setMinPct] = useState("5");
  const [maxPct, setMaxPct] = useState("20");
  const [flat, setFlat] = useState("");

  // New discount draft
  const [dName, setDName] = useState("");
  const [dCode, setDCode] = useState("");
  const [dKind, setDKind] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [dValue, setDValue] = useState("");
  const [dEarly, setDEarly] = useState(false);
  const [dStarts, setDStarts] = useState("");
  const [dExpires, setDExpires] = useState("");
  const [dMax, setDMax] = useState("");
  const [dTiers, setDTiers] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/events/${id}/dashboard`);
    if (!res.ok) return setMissing(true);
    const d: Data = await res.json();
    setData(d);
    setEventLimit(d.event.maxPerBuyer ? String(d.event.maxPerBuyer) : "");
    setTierLimits(Object.fromEntries(d.tiers.map((t) => [t.productId, t.maxPerBuyer ? String(t.maxPerBuyer) : ""])));
    setPromOpen(d.event.promotersOpen);
    setPayType(d.event.promoterPayType);
    setMinPct(String(d.event.promoterMinPercent));
    setMaxPct(String(d.event.promoterMaxPercent));
    setFlat(d.event.promoterFlatKobo ? String(d.event.promoterFlatKobo / 100) : "");
  }, [id]);

  useEffect(() => {
    if (!appUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch when the page opens
    load();
  }, [appUser, load]);

  async function call(url: string, method: string, body?: unknown, ok?: string) {
    setBusy(true);
    try {
      const res = await apiFetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Something went wrong");
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div className="pb-24">
        <BackHeader title="Event dashboard" />
        <p className="px-4 text-sm text-ink-3">This event can&apos;t be found, or it isn&apos;t yours.</p>
      </div>
    );
  }
  if (!data) return <LoadingSpinner full size="lg" />;

  const totalSold = data.tiers.reduce((n, t) => n + t.sold, 0);
  const totalGross = data.tiers.reduce((n, t) => n + t.grossKobo, 0);
  const pending = data.promoters.filter((p) => p.status === "PENDING");
  const active = data.promoters.filter((p) => p.status === "APPROVED");

  function saveSettings() {
    const min = Number(minPct);
    const max = Number(maxPct);
    if (payType === "PERCENT" && (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 100 || min > max)) {
      return toast.error("Set a commission range between 1% and 100%");
    }
    return call(
      `/api/events/${id}/settings`,
      "PATCH",
      {
        promotersOpen: promOpen,
        promoterPayType: payType,
        promoterMinPercent: min,
        promoterMaxPercent: max,
        promoterFlatKobo: toKobo(flat),
        maxPerBuyer: numOrNull(eventLimit),
        tierLimits: data!.tiers.map((t) => ({ productId: t.productId, maxPerBuyer: numOrNull(tierLimits[t.productId] ?? "") })),
      },
      "Settings saved.",
    );
  }

  async function createDiscount() {
    const value = dKind === "PERCENT" ? Math.floor(Number(dValue)) : toKobo(dValue);
    if (!dName.trim() || !value || value <= 0) return toast.error("Give the discount a name and an amount");
    if (!dEarly && !dCode.trim()) return toast.error("Add a code, or make it an automatic early-bird offer");
    const ok = await call(
      `/api/events/${id}/discounts`,
      "POST",
      {
        name: dName.trim(),
        code: dEarly ? null : dCode.trim(),
        kind: dKind,
        value,
        isEarlyBird: dEarly,
        startsAt: dStarts ? new Date(dStarts).toISOString() : null,
        expiresAt: dExpires ? new Date(dExpires).toISOString() : null,
        maxUses: numOrNull(dMax),
        tierIds: dTiers,
      },
      "Discount created.",
    );
    if (ok) {
      setDName("");
      setDCode("");
      setDValue("");
      setDEarly(false);
      setDStarts("");
      setDExpires("");
      setDMax("");
      setDTiers([]);
    }
  }

  return (
    <div className="pb-28">
      <BackHeader title="Event dashboard" />
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4">
        <div>
          <Link href={`/e/${id}`} className="text-[20px] font-bold">
            {data.event.title}
          </Link>
          <p className="text-sm text-ink-3">{new Date(data.event.startsAt).toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            ["Tickets sold", totalSold.toLocaleString("en-NG")],
            ["Ticket sales", naira(totalGross)],
            ["Promoters", String(active.length)],
          ].map(([l, v]) => (
            <div key={l} className={card}>
              <p className="text-[12px] text-ink-3">{l}</p>
              <p className="mt-1 text-[18px] font-bold">{v}</p>
            </div>
          ))}
        </div>

        <section className={card}>
          <h2 className={h2}>Tickets</h2>
          <div className="flex flex-col divide-y divide-white/10">
            {data.tiers.map((t) => (
              <div key={t.productId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {t.name} {!t.onSale && <span className="text-xs text-ink-3">(off sale)</span>}
                  </span>
                  <span className="block text-[13px] text-ink-3">
                    {t.sold}
                    {t.cap != null ? ` of ${t.cap}` : ""} sold · {naira(t.grossKobo)} · {t.priceKobo === 0 ? "Free" : naira(t.priceKobo)}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-[13px] text-ink-3">
                  Max per buyer
                  <input
                    type="number"
                    min={1}
                    value={tierLimits[t.productId] ?? ""}
                    onChange={(e) => setTierLimits((cur) => ({ ...cur, [t.productId]: e.target.value }))}
                    placeholder="No limit"
                    className={`${input} w-24`}
                  />
                </label>
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-2">Max tickets per buyer for the whole event</span>
            <input type="number" min={1} value={eventLimit} onChange={(e) => setEventLimit(e.target.value)} placeholder="No limit" className={`${input} w-24`} />
          </label>
          <p className="mt-2 text-xs text-ink-3">Limits count every ticket a person holds or is checking out, free or paid, so several orders can&apos;t get round them.</p>
        </section>

        <section className={card}>
          <h2 className={h2}>Promoters</h2>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-2">Let anyone apply to promote this event</span>
            <input type="checkbox" checked={promOpen} onChange={(e) => setPromOpen(e.target.checked)} className="h-5 w-5 accent-red" />
          </label>
          <div className="mt-3 flex gap-2">
            {(["PERCENT", "FLAT"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPayType(k)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${payType === k ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
              >
                {k === "PERCENT" ? "% of ticket price" : "Flat amount per ticket"}
              </button>
            ))}
          </div>
          {payType === "PERCENT" ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              Promoters pick between
              <input type="number" min={1} max={100} value={minPct} onChange={(e) => setMinPct(e.target.value)} className={`${input} w-16`} />% and
              <input type="number" min={1} max={100} value={maxPct} onChange={(e) => setMaxPct(e.target.value)} className={`${input} w-16`} />%
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              ₦
              <input type="number" min={0} value={flat} onChange={(e) => setFlat(e.target.value)} placeholder="e.g. 500" className={`${input} w-28`} />
              per ticket sold
            </div>
          )}
          <p className="mt-2 text-xs text-ink-3">
            Worked out on what the buyer pays for the tickets after any discount, from your share — XOLDOUT&apos;s fee doesn&apos;t change it. Each order fixes it at
            checkout, it&apos;s paid once, and promoters never earn on their own purchases.
          </p>
          <button type="button" onClick={saveSettings} disabled={busy} className="mt-4 w-full rounded-full bg-red py-3 text-[15px] font-bold text-white disabled:opacity-50">
            Save tickets and promoter settings
          </button>

          {pending.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-widest text-ink-3">Applications</p>
              {pending.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/u/${p.user.handle}`} className="min-w-0 truncate text-sm font-semibold">
                    {p.user.displayName} <span className="font-normal text-ink-3">@{p.user.handle}</span>
                  </Link>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => call(`/api/events/${id}/promoters/${p.id}`, "PATCH", { status: "APPROVED" }, "Approved.")} className="rounded-full bg-red px-3 py-1.5 text-xs font-bold text-white">
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => call(`/api/events/${id}/promoters/${p.id}`, "PATCH", { status: "REJECTED" }, "Rejected.")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                      Reject
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-widest text-ink-3">Performance</p>
          {active.length === 0 ? (
            <p className="text-sm text-ink-3">No approved promoters yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-ink-3">
                  <tr>
                    <th className="py-1.5 font-normal">Promoter</th>
                    <th className="py-1.5 font-normal">{data.event.promoterPayType === "FLAT" ? "Pay" : "%"}</th>
                    <th className="py-1.5 font-normal">Clicks</th>
                    <th className="py-1.5 font-normal">Tickets</th>
                    <th className="py-1.5 font-normal">Earned</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {active.map((p) => (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="py-2 pr-2">@{p.user.handle}</td>
                      <td className="py-2 pr-2">{data.event.promoterPayType === "FLAT" ? naira(data.event.promoterFlatKobo) : `${p.sharePercent}%`}</td>
                      <td className="py-2 pr-2">{p.clickCount}</td>
                      <td className="py-2 pr-2">{p.tickets}</td>
                      <td className="py-2 pr-2">{naira(p.earnedKobo)}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (await toast.confirm(`Remove @${p.user.handle} as a promoter? Past commissions stay paid.`, { confirmLabel: "Remove", destructive: true }))
                              call(`/api/events/${id}/promoters/${p.id}`, "DELETE", undefined, "Promoter removed.");
                          }}
                          className="text-xs text-ink-3"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-3">You can also add a promoter directly from your event page.</p>
        </section>

        <section className={card}>
          <h2 className={h2}>Discounts</h2>
          {data.discounts.length === 0 ? (
            <p className="text-sm text-ink-3">No discounts yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-white/10">
              {data.discounts.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {d.name} <span className="font-normal text-ink-3">· {d.code ?? "Automatic"}</span>
                      {!d.active && <span className="text-xs text-ink-3"> (off)</span>}
                    </span>
                    <span className="block text-[13px] text-ink-3">
                      {d.kind === "PERCENT" ? `${d.value}% off` : `${naira(d.value)} off each ticket`} · {d.uses}
                      {d.maxUses != null ? ` of ${d.maxUses}` : ""} used · {naira(d.totalOffKobo)} given
                      {d.expiresAt ? ` · ends ${new Date(d.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : ""}
                      {d.tierIds.length ? ` · ${data.tiers.filter((t) => d.tierIds.includes(t.productId)).map((t) => t.name).join(", ")}` : " · all tickets"}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => call(`/api/events/${id}/discounts/${d.id}`, "PATCH", { active: !d.active })} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                      {d.active ? "Turn off" : "Turn on"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => call(`/api/events/${id}/discounts/${d.id}`, "DELETE", undefined, d.uses ? "Used discounts are switched off, not deleted." : "Deleted.")} className="text-xs text-ink-3">
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-widest text-ink-3">New discount</p>
          <div className="flex flex-col gap-2.5">
            <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Name (e.g. Early bird, Student)" maxLength={60} className={input} />
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={dEarly} onChange={(e) => setDEarly(e.target.checked)} className="h-4 w-4 accent-red" />
              Early-bird offer (applies automatically, no code)
            </label>
            {!dEarly && <input value={dCode} onChange={(e) => setDCode(e.target.value.toUpperCase().slice(0, 30))} placeholder="Code (e.g. LAGOS20)" className={`${input} uppercase`} />}
            <div className="flex items-center gap-2">
              {(["PERCENT", "FLAT"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDKind(k)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${dKind === k ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
                >
                  {k === "PERCENT" ? "Percentage" : "Fixed amount"}
                </button>
              ))}
              <input type="number" min={1} value={dValue} onChange={(e) => setDValue(e.target.value)} placeholder={dKind === "PERCENT" ? "% off" : "₦ off each"} className={`${input} w-28`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-ink-3">
                Starts (optional)
                <input type="datetime-local" value={dStarts} onChange={(e) => setDStarts(e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-3">
                Ends (optional)
                <input type="datetime-local" value={dExpires} onChange={(e) => setDExpires(e.target.value)} className={input} />
              </label>
            </div>
            <input type="number" min={1} value={dMax} onChange={(e) => setDMax(e.target.value)} placeholder="Usage limit — number of orders (optional)" className={input} />
            <div className="flex flex-wrap gap-1.5">
              <span className="w-full text-xs text-ink-3">Ticket types (none picked = all)</span>
              {data.tiers.map((t) => (
                <button
                  key={t.productId}
                  type="button"
                  onClick={() => setDTiers((cur) => (cur.includes(t.productId) ? cur.filter((x) => x !== t.productId) : [...cur, t.productId]))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${dTiers.includes(t.productId) ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={createDiscount} disabled={busy} className="rounded-full bg-red py-3 text-[15px] font-bold text-white disabled:opacity-50">
              Create discount
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
