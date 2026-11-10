"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { useToast } from "@/components/ui/ToastProvider";
import { ManageGroupSheet } from "@/components/groups/ManageGroupSheet";
import { COMMUNITY_CATEGORIES, MAX_CHANNELS, MAX_PLANS, MIN_PAID_PLAN_KOBO, PLAN_CYCLES } from "@/lib/communities/constants";

type PlanDraft = {
  key: string;
  id?: string;
  name: string;
  description: string;
  naira: string;
  cycle: string;
  benefits: string;
  capacity: string;
  requiresApproval: boolean;
};
type ChannelDraft = { key: string; id?: string; name: string; kind: string; planIds: string[] };

const input = "w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-red";
const label = "text-[12px] uppercase tracking-widest text-ink-3";
let seq = 0;
const k = () => `n${++seq}`;

// Manage community (v2, design/v2-prototype): details and plans (owner),
// channels (admins), plus the existing members / requests / delete sheet.
export default function ManageCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [details, setDetails] = useState({ name: "", handle: "", category: "", location: "", description: "", rules: "", isPrivate: true });
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [channels, setChannels] = useState<ChannelDraft[]>([]);
  const [meta, setMeta] = useState({ postPermission: "ALL_MEMBERS", visibility: "REQUEST_TO_JOIN", isVerified: false, verificationRequestedAt: null as string | null });
  const [saving, setSaving] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const bannerInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/communities/${id}`);
    if (!res.ok) return setLoaded(true);
    const d = await res.json();
    const c = d.community;
    setIsOwner(d.viewer.isOwner);
    setIsAdmin(d.viewer.isAdmin);
    setDetails({
      name: c.name,
      handle: c.handle ?? "",
      category: c.category ?? "",
      location: c.location ?? "",
      description: c.description ?? "",
      rules: c.rules ?? "",
      isPrivate: c.isPrivate,
    });
    setBannerUrl(c.bannerUrl);
    setInviteCode(c.inviteCode);
    setMeta({ postPermission: c.postPermission, visibility: c.visibility, isVerified: c.isVerified, verificationRequestedAt: c.verificationRequestedAt ?? null });
    setPlans(
      d.plans.map((p: { id: string; name: string; description: string | null; priceKobo: number; cycle: string; benefits: string[]; capacity: number | null; requiresApproval: boolean }) => ({
        key: p.id,
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        naira: String(p.priceKobo / 100),
        cycle: p.cycle,
        benefits: p.benefits.join("\n"),
        capacity: p.capacity ? String(p.capacity) : "",
        requiresApproval: p.requiresApproval,
      })),
    );
    setChannels(
      d.channels
        .filter((ch: { id: string }) => ch.id !== "general")
        .map((ch: { id: string; name: string; kind: string; planIds: string[] }) => ({ key: ch.id, id: ch.id, name: ch.name, kind: ch.kind, planIds: ch.planIds })),
    );
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load
    load();
  }, [load]);

  async function call(what: string, url: string, method: string, body: unknown, ok: string) {
    setSaving(what);
    try {
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't save");
      toast.success(ok);
      return d;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
      return null;
    } finally {
      setSaving(null);
    }
  }

  async function saveDetails() {
    const d = await call(
      "details",
      `/api/communities/${id}`,
      "PATCH",
      {
        name: details.name,
        handle: details.handle.trim() || null,
        category: details.category || null,
        location: details.location.trim() || null,
        description: details.description,
        rules: details.rules.trim() || null,
        visibility: details.isPrivate ? "REQUEST_TO_JOIN" : "OPEN",
      },
      "Details saved",
    );
    if (d) setInviteCode(d.community.inviteCode);
  }

  async function uploadBanner(file: File) {
    setSaving("banner");
    try {
      const key = await uploadImage(file, "avatar");
      const res = await apiFetch(`/api/communities/${id}`, { method: "PATCH", body: JSON.stringify({ bannerKey: key }) });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Upload failed");
      setBannerUrl(d.community.bannerUrl);
      toast.success("Cover updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(null);
    }
  }

  async function rotateCode() {
    const d = await call("code", `/api/communities/${id}`, "PATCH", { newInviteCode: true }, "New invite code made");
    if (d) setInviteCode(d.community.inviteCode);
  }

  async function savePlans() {
    for (const p of plans) {
      const kobo = Math.round(parseFloat(p.naira || "0") * 100);
      if (!p.name.trim()) return toast.error("Every plan needs a name");
      if (!Number.isFinite(kobo) || (kobo > 0 && kobo < MIN_PAID_PLAN_KOBO)) return toast.error("Paid plans need at least ₦100.");
    }
    const d = await call(
      "plans",
      `/api/communities/${id}/plans`,
      "PUT",
      {
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name.trim(),
          description: p.description.trim() || null,
          priceKobo: Math.round(parseFloat(p.naira || "0") * 100),
          cycle: p.cycle,
          benefits: p.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
          capacity: p.capacity ? parseInt(p.capacity, 10) : null,
          requiresApproval: p.requiresApproval,
        })),
      },
      "Plans saved",
    );
    if (d) load();
  }

  async function saveChannels() {
    if (channels.some((c) => !c.name.trim())) return toast.error("Every channel needs a name");
    const d = await call(
      "channels",
      `/api/communities/${id}/channels`,
      "PUT",
      { channels: channels.map((c) => ({ id: c.id, name: c.name.trim(), kind: c.kind, planIds: c.planIds })) },
      "Channels saved",
    );
    if (d) load();
  }

  if (!loaded) return <LoadingSpinner full size="lg" />;
  if (!isAdmin) return <p className="px-4 py-20 text-center text-ink-3">Only this community&apos;s admins can manage it.</p>;

  const setPlan = (key: string, patch: Partial<PlanDraft>) => setPlans((cur) => cur.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const setChannel = (key: string, patch: Partial<ChannelDraft>) => setChannels((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) =>
    setChannels((cur) => {
      const next = [...cur];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
      return next;
    });
  const savedPlans = plans.filter((p) => p.id);

  return (
    <div className="pb-24">
      <BackHeader title="Manage community" />
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4">
        <div className="flex gap-2">
          <Link href={`/groups/${id}`} className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold">
            View community
          </Link>
          <button type="button" onClick={() => setSheetOpen(true)} className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold">
            Members, requests &amp; admins
          </button>
        </div>

        {isOwner && (
          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl font-bold">Details</h2>
            <div className="relative h-28 overflow-hidden rounded-2xl border border-dashed border-line bg-gradient-to-br from-red/50 via-red-tint to-black">
              {bannerUrl && <FallbackImg src={bannerUrl} alt="" className="h-full w-full object-cover" fallback={null} />}
              <button type="button" onClick={() => bannerInput.current?.click()} className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">
                {saving === "banner" ? "Uploading…" : bannerUrl ? "Change cover" : "Add cover"}
              </button>
              <input
                ref={bannerInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadBanner(f);
                  e.target.value = "";
                }}
              />
            </div>
            <label className={label}>Community name</label>
            <input className={input} value={details.name} maxLength={60} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
            <label className={label}>Username (unique handle)</label>
            <input className={input} value={details.handle} placeholder="e.g. xrecordingclub" onChange={(e) => setDetails({ ...details, handle: e.target.value.toLowerCase() })} />
            <label className={label}>Category</label>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDetails({ ...details, category: details.category === c ? "" : c })}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold ${details.category === c ? "bg-red text-white" : "border border-line bg-surface text-ink-2"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <label className={label}>Location</label>
            <input className={input} value={details.location} placeholder="e.g. Lagos" onChange={(e) => setDetails({ ...details, location: e.target.value })} />
            <label className={label}>Description</label>
            <textarea className={`${input} min-h-24`} value={details.description} maxLength={1000} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
            <label className={label}>Community rules</label>
            <textarea className={`${input} min-h-24`} value={details.rules} maxLength={3000} onChange={(e) => setDetails({ ...details, rules: e.target.value })} />
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
              <span>
                <span className="block font-semibold">Private community</span>
                <span className="block text-xs text-ink-3">Without plans, people ask to join and an admin approves. An invite code skips that.</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-red" checked={details.isPrivate} onChange={(e) => setDetails({ ...details, isPrivate: e.target.checked })} />
            </label>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
              <span>
                <span className="block font-semibold">Invite code</span>
                <span className="block font-mono text-lg tracking-widest">{inviteCode ?? "—"}</span>
              </span>
              <span className="flex gap-2">
                {inviteCode && (
                  <button type="button" onClick={() => navigator.clipboard?.writeText(inviteCode).then(() => toast.success("Copied"))} className="rounded-full border border-line px-3 py-2 text-xs font-bold">
                    Copy
                  </button>
                )}
                <button type="button" onClick={rotateCode} disabled={saving === "code"} className="rounded-full border border-line px-3 py-2 text-xs font-bold">
                  {inviteCode ? "New code" : "Create code"}
                </button>
              </span>
            </div>
            <button type="button" onClick={saveDetails} disabled={saving === "details"} className="rounded-full bg-red px-5 py-3.5 font-bold text-white disabled:opacity-50">
              {saving === "details" ? "Saving…" : "Save details"}
            </button>
          </section>
        )}

        {isOwner && (
          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl font-bold">Membership plans</h2>
            <p className="text-sm text-ink-3">Free, paid, or both. Paid plans need at least ₦100. Removing a plan stops new joins and renewals; people on it keep their time.</p>
            {plans.map((p) => (
              <div key={p.key} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
                <div className="flex gap-2">
                  <input className={input} aria-label="Plan name" placeholder="Plan name, e.g. Standard" value={p.name} maxLength={40} onChange={(e) => setPlan(p.key, { name: e.target.value })} />
                  <button type="button" onClick={() => setPlans((cur) => cur.filter((x) => x.key !== p.key))} aria-label="Remove plan" className="shrink-0 rounded-xl border border-line px-3 text-sm text-ink-3">
                    Remove
                  </button>
                </div>
                <input className={input} aria-label="Plan description" placeholder="Short description" value={p.description} maxLength={200} onChange={(e) => setPlan(p.key, { description: e.target.value })} />
                <div className="flex gap-2">
                  <label className="flex flex-1 items-center rounded-xl border border-line bg-bg px-3">
                    <span className="text-sm text-ink-3">₦</span>
                    <input inputMode="numeric" aria-label="Plan price" placeholder="0 = free" value={p.naira} onChange={(e) => setPlan(p.key, { naira: e.target.value.replace(/[^\d.]/g, "") })} className="w-full bg-transparent px-1.5 py-3 text-sm outline-none" />
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
                onClick={() => setPlans((cur) => [...cur, { key: k(), name: "", description: "", naira: "", cycle: "MONTHLY", benefits: "", capacity: "", requiresApproval: false }])}
                className="rounded-2xl border border-dashed border-line px-4 py-3.5 text-sm font-bold"
              >
                + Add membership plan
              </button>
            )}
            <button type="button" onClick={savePlans} disabled={saving === "plans"} className="rounded-full bg-red px-5 py-3.5 font-bold text-white disabled:opacity-50">
              {saving === "plans" ? "Saving…" : "Save plans"}
            </button>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl font-bold">Channels</h2>
          <p className="text-sm text-ink-3">
            Announcements: only admins post. Discussion: members chat. Limit a channel to certain plans, or leave it open to every member. &quot;General&quot; (your original chat) is always there.
          </p>
          {channels.map((c, i) => (
            <div key={c.key} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
              <div className="flex gap-2">
                <input className={input} aria-label="Channel name" placeholder="Channel name" value={c.name} maxLength={40} onChange={(e) => setChannel(c.key, { name: e.target.value })} />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="shrink-0 rounded-xl border border-line px-3 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === channels.length - 1} aria-label="Move down" className="shrink-0 rounded-xl border border-line px-3 disabled:opacity-30">
                  ↓
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["ANNOUNCEMENTS", "DISCUSSION"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setChannel(c.key, { kind })}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${c.kind === kind ? "bg-red text-white" : "border border-line text-ink-2"}`}
                  >
                    {kind === "ANNOUNCEMENTS" ? "Announcements" : "Discussion"}
                  </button>
                ))}
              </div>
              {savedPlans.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-3">Who can access:</span>
                  <button
                    type="button"
                    onClick={() => setChannel(c.key, { planIds: [] })}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold ${c.planIds.length === 0 ? "bg-white text-black" : "border border-line text-ink-2"}`}
                  >
                    All members
                  </button>
                  {savedPlans.map((p) => {
                    const on = c.planIds.includes(p.id!);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setChannel(c.key, { planIds: on ? c.planIds.filter((x) => x !== p.id) : [...c.planIds, p.id!] })}
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold ${on ? "bg-white text-black" : "border border-line text-ink-2"}`}
                      >
                        {p.name || "Plan"}
                      </button>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={() => setChannels((cur) => cur.filter((x) => x.key !== c.key))} className="self-start text-xs font-semibold text-red-soft">
                Delete channel (its messages move to General)
              </button>
            </div>
          ))}
          {channels.length < MAX_CHANNELS && (
            <button type="button" onClick={() => setChannels((cur) => [...cur, { key: k(), name: "", kind: "DISCUSSION", planIds: [] }])} className="rounded-2xl border border-dashed border-line px-4 py-3.5 text-sm font-bold">
              + New channel
            </button>
          )}
          <button type="button" onClick={saveChannels} disabled={saving === "channels"} className="rounded-full bg-red px-5 py-3.5 font-bold text-white disabled:opacity-50">
            {saving === "channels" ? "Saving…" : "Save channels"}
          </button>
        </section>
      </div>

      <ManageGroupSheet
        groupId={id}
        isCreator={isOwner}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        postPermission={meta.postPermission as "CREATOR_ONLY" | "ADMINS" | "ALL_MEMBERS"}
        visibility={meta.visibility as "OPEN" | "REQUEST_TO_JOIN"}
        isVerified={meta.isVerified}
        verificationRequestedAt={meta.verificationRequestedAt}
        onSettingsChanged={(patch) => setMeta((cur) => ({ ...cur, ...(patch as Partial<typeof cur>) }))}
        onDeleted={() => router.push("/socials?tab=fanbase")}
      />
    </div>
  );
}
