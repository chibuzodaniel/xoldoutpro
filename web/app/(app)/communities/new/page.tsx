"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { useToast } from "@/components/ui/ToastProvider";
import { COMMUNITY_CATEGORIES, MAX_PLANS, MIN_PAID_PLAN_KOBO, PLAN_CYCLES, planPriceLabel } from "@/lib/communities/constants";

type Plan = { key: string; name: string; description: string; naira: string; cycle: string; benefits: string; capacity: string; requiresApproval: boolean };
type Topic = { key: string; name: string; planKeys: string[] };

const STEPS = ["Basics", "Access", "Plans", "Channels", "Review"] as const;
const input = "w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-red";
const label = "text-[13px] text-ink-3";
let seq = 0;
const k = () => `k${++seq}`;
const kobo = (naira: string) => Math.round(parseFloat(naira || "0") * 100);

// Create community — 5 steps (v2, design/v2-prototype).
export default function CreateCommunityPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [basics, setBasics] = useState({ name: "", handle: "", description: "", category: COMMUNITY_CATEGORIES[0] as string });
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null);
  const [banner, setBanner] = useState<{ file: File; url: string } | null>(null);
  const [paid, setPaid] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [location, setLocation] = useState("");
  const [rules, setRules] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [topics, setTopics] = useState<Topic[]>([{ key: k(), name: "General Discussion", planKeys: [] }]);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const setPlan = (key: string, patch: Partial<Plan>) => setPlans((cur) => cur.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const usedPlans = paid ? plans : [];

  function validate(s: number): string | null {
    if (s === 0) {
      if (!basics.name.trim()) return "Give your community a name";
      if (basics.handle && !/^[a-z0-9_.]{3,30}$/.test(basics.handle)) return "Handle: 3–30 letters, numbers, dots or underscores";
    }
    if (s === 2 && paid) {
      if (plans.length === 0) return "Add at least one plan for a paid community";
      for (const p of plans) {
        if (!p.name.trim()) return "Every plan needs a name";
        const v = kobo(p.naira);
        if (!Number.isFinite(v) || (v > 0 && v < MIN_PAID_PLAN_KOBO)) return "Paid plans need at least ₦100.";
      }
      if (!plans.some((p) => kobo(p.naira) > 0)) return "A paid community needs at least one paid plan";
    }
    if (s === 3 && topics.some((t) => !t.name.trim())) return "Every channel needs a name";
    return null;
  }

  function next() {
    const err = validate(step);
    if (err) return toast.error(err);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function create() {
    for (let s = 0; s < STEPS.length - 1; s++) {
      const err = validate(s);
      if (err) {
        setStep(s);
        return toast.error(err);
      }
    }
    setBusy(true);
    try {
      const [logoKey, bannerKey] = await Promise.all([logo ? uploadImage(logo.file, "avatar") : null, banner ? uploadImage(banner.file, "avatar") : null]);
      const planIndex = new Map(usedPlans.map((p, i) => [p.key, i]));
      const res = await apiFetch("/api/communities", {
        method: "POST",
        body: JSON.stringify({
          name: basics.name.trim(),
          handle: basics.handle.trim() || null,
          description: basics.description.trim(),
          category: basics.category,
          location: location.trim() || null,
          rules: rules.trim() || null,
          isPrivate,
          logoKey: logoKey ?? undefined,
          bannerKey: bannerKey ?? undefined,
          plans: usedPlans.map((p) => ({
            name: p.name.trim(),
            description: p.description.trim() || null,
            priceKobo: kobo(p.naira),
            cycle: p.cycle,
            benefits: p.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
            capacity: p.capacity ? parseInt(p.capacity, 10) : null,
            requiresApproval: p.requiresApproval,
          })),
          topics: topics.map((t) => ({ name: t.name.trim(), planIndexes: t.planKeys.map((pk) => planIndex.get(pk)).filter((x): x is number => x !== undefined) })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't create the community");
      toast.success("Community created");
      router.replace(`/groups/${d.community.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the community");
    } finally {
      setBusy(false);
    }
  }

  const pickImage = (set: (v: { file: File; url: string }) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) set({ file, url: URL.createObjectURL(file) });
    e.target.value = "";
  };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-28">
      <div className="flex items-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="font-serif text-[28px] font-bold">Create community</h1>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">
        Step {step + 1} of {STEPS.length} · <span className="text-red-soft">{STEPS[step]}</span>
      </p>
      <div className="mt-2 flex gap-1.5">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-red" : "bg-line"}`} />
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {step === 0 && (
          <>
            <span className={label}>Community name</span>
            <input className={input} placeholder="e.g. X Recording Club" maxLength={60} value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} />
            <span className={label}>Username (unique handle)</span>
            <input className={input} placeholder="xrecordingclub" value={basics.handle} onChange={(e) => setBasics({ ...basics, handle: e.target.value.toLowerCase().replace(/\s/g, "") })} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <span className={label}>Logo</span>
                <button type="button" onClick={() => logoInput.current?.click()} className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface text-sm font-semibold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo ? <img src={logo.url} alt="" className="h-full w-full object-cover" /> : "Choose"}
                </button>
                <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage(setLogo)} />
              </div>
              <div className="flex flex-col gap-2">
                <span className={label}>Cover image</span>
                <button type="button" onClick={() => bannerInput.current?.click()} className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface text-sm font-semibold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {banner ? <img src={banner.url} alt="" className="h-full w-full object-cover" /> : "Choose"}
                </button>
                <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage(setBanner)} />
              </div>
            </div>
            <span className={label}>Description</span>
            <textarea className={`${input} min-h-28`} maxLength={1000} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} />
            <span className={label}>Category</span>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBasics({ ...basics, category: c })}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold ${basics.category === c ? "bg-red text-white" : "border border-line bg-surface text-ink-2"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {[
              { v: false, t: "Free community", d: "Anyone can join without paying." },
              { v: true, t: "Paid community", d: "Members join on a plan you set — monthly, yearly or one-time." },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                onClick={() => setPaid(o.v)}
                className={`rounded-2xl border p-4 text-left ${paid === o.v ? "border-red bg-red-tint" : "border-line bg-surface"}`}
              >
                <span className="block text-[16px] font-bold">{o.t}</span>
                <span className="block text-[13px] text-ink-3">{o.d}</span>
              </button>
            ))}
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
              <span>
                <span className="block font-semibold">Private</span>
                <span className="block text-xs text-ink-3">{paid ? "Plans can each require approval." : "People ask to join; an admin approves. Invite codes skip that."}</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-red" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            </label>
            <span className={label}>Location (optional)</span>
            <input className={input} placeholder="e.g. Lagos" value={location} onChange={(e) => setLocation(e.target.value)} />
            <span className={label}>Community rules (optional)</span>
            <textarea className={`${input} min-h-24`} maxLength={3000} value={rules} onChange={(e) => setRules(e.target.value)} />
          </>
        )}

        {step === 2 &&
          (!paid ? (
            <p className="rounded-2xl border border-line p-5 text-sm text-ink-3">Free communities don&apos;t need plans. You can add paid plans later from Manage community.</p>
          ) : (
            <>
              <p className="text-sm text-ink-3">Set what members pay and what they get. Paid plans need at least ₦100; ₦0 makes a free tier.</p>
              {plans.map((p) => (
                <div key={p.key} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
                  <div className="flex gap-2">
                    <input className={input} aria-label="Plan name" placeholder="Plan name, e.g. Standard" maxLength={40} value={p.name} onChange={(e) => setPlan(p.key, { name: e.target.value })} />
                    <button type="button" onClick={() => setPlans((cur) => cur.filter((x) => x.key !== p.key))} className="shrink-0 rounded-xl border border-line px-3 text-sm text-ink-3">
                      Remove
                    </button>
                  </div>
                  <input className={input} aria-label="Plan description" placeholder="Short description" maxLength={200} value={p.description} onChange={(e) => setPlan(p.key, { description: e.target.value })} />
                  <div className="flex gap-2">
                    <label className="flex flex-1 items-center rounded-xl border border-line bg-bg px-3">
                      <span className="text-sm text-ink-3">₦</span>
                      <input inputMode="numeric" aria-label="Plan price" placeholder="Price" value={p.naira} onChange={(e) => setPlan(p.key, { naira: e.target.value.replace(/[^\d.]/g, "") })} className="w-full bg-transparent px-1.5 py-3 text-sm outline-none" />
                    </label>
                    <select aria-label="Billing" value={p.cycle} onChange={(e) => setPlan(p.key, { cycle: e.target.value })} className="rounded-xl border border-line bg-surface px-3 text-sm">
                      {PLAN_CYCLES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea className={`${input} min-h-20`} aria-label="Plan benefits" placeholder="Benefits, one per line" value={p.benefits} onChange={(e) => setPlan(p.key, { benefits: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" aria-label="Plan capacity" placeholder="Spots (blank = unlimited)" value={p.capacity} onChange={(e) => setPlan(p.key, { capacity: e.target.value.replace(/\D/g, "") })} className={input} />
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5 accent-red" checked={p.requiresApproval} onChange={(e) => setPlan(p.key, { requiresApproval: e.target.checked })} />
                      Needs approval
                    </label>
                  </div>
                </div>
              ))}
              {plans.length < MAX_PLANS && (
                <button
                  type="button"
                  onClick={() => setPlans((cur) => [...cur, { key: k(), name: cur.length ? "" : "Standard", description: "", naira: "", cycle: "MONTHLY", benefits: "", capacity: "", requiresApproval: false }])}
                  className="rounded-2xl border border-dashed border-line px-4 py-3.5 text-sm font-bold"
                >
                  + Add membership plan
                </button>
              )}
            </>
          ))}

        {step === 3 && (
          <>
            <p className="text-sm text-ink-3">Every community gets Announcements (admins post) and General. Add topic channels{usedPlans.length ? ", and choose which plans can open each" : ""}.</p>
            {topics.map((t) => (
              <div key={t.key} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex gap-2">
                  <input className={input} aria-label="Topic name" placeholder="Topic name" maxLength={40} value={t.name} onChange={(e) => setTopics((cur) => cur.map((x) => (x.key === t.key ? { ...x, name: e.target.value } : x)))} />
                  <button type="button" onClick={() => setTopics((cur) => cur.filter((x) => x.key !== t.key))} className="shrink-0 rounded-xl border border-line px-3 text-sm text-ink-3">
                    Remove
                  </button>
                </div>
                {usedPlans.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTopics((cur) => cur.map((x) => (x.key === t.key ? { ...x, planKeys: [] } : x)))}
                      className={`rounded-full px-3 py-1 text-[12px] font-semibold ${t.planKeys.length === 0 ? "bg-white text-black" : "border border-line text-ink-2"}`}
                    >
                      All members
                    </button>
                    {usedPlans.map((p) => {
                      const on = t.planKeys.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setTopics((cur) => cur.map((x) => (x.key === t.key ? { ...x, planKeys: on ? x.planKeys.filter((y) => y !== p.key) : [...x.planKeys, p.key] } : x)))}
                          className={`rounded-full px-3 py-1 text-[12px] font-semibold ${on ? "bg-white text-black" : "border border-line text-ink-2"}`}
                        >
                          {p.name || "Plan"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setTopics((cur) => [...cur, { key: k(), name: "", planKeys: [] }])} className="rounded-2xl border border-dashed border-line px-4 py-3.5 text-sm font-bold">
              + New topic
            </button>
          </>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-sm">
            <p className="font-serif text-2xl font-bold">{basics.name || "Untitled"}</p>
            {basics.handle && <p className="text-ink-3">@{basics.handle}</p>}
            <p className="text-ink-2">
              {basics.category} · {isPrivate ? "Private" : "Public"} · {paid ? "Paid" : "Free"}
              {location ? ` · ${location}` : ""}
            </p>
            {basics.description && <p className="text-ink-3">{basics.description}</p>}
            {usedPlans.length > 0 && (
              <div>
                <p className="mb-1 font-bold">Plans</p>
                {usedPlans.map((p) => (
                  <p key={p.key} className="text-ink-2">
                    {p.name} — {planPriceLabel({ priceKobo: kobo(p.naira), cycle: p.cycle })}
                    {p.requiresApproval ? " · approval" : ""}
                    {p.capacity ? ` · ${p.capacity} spots` : ""}
                  </p>
                ))}
              </div>
            )}
            <div>
              <p className="mb-1 font-bold">Channels</p>
              <p className="text-ink-2">Announcements, General{topics.length ? `, ${topics.map((t) => t.name || "Untitled").join(", ")}` : ""}</p>
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[72px] z-20 mx-auto max-w-xl border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur">
        <button type="button" onClick={step === STEPS.length - 1 ? create : next} disabled={busy} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
          {busy ? "Creating…" : step === STEPS.length - 1 ? "Create community" : "Continue"}
        </button>
      </div>
    </div>
  );
}
