"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { PLAN_CYCLES, planPriceLabel } from "@/lib/communities/constants";
import { withNext } from "@/lib/returnTo";

// Plans + checkout on a community's join page (/join/[id], 2026-11-16).
// Signed out: guest checkout. Name, email (confirmed with a 6-digit code;
// explicit ask: every email verified), optional phone, then pay; the account
// is created after payment (lib/communities/guestJoin.ts). Signed in: the
// usual join (POST /api/communities/[id]/join).

export type JoinPlan = {
  id: string;
  name: string;
  description: string | null;
  priceKobo: number;
  cycle: string;
  benefits: string[];
  requiresApproval: boolean;
  spotsLeft: number | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const input = "w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-[16px] outline-none transition-colors focus:border-red";

function durationLabel(p: JoinPlan) {
  if (p.priceKobo === 0) return "Free · no expiry";
  const c = PLAN_CYCLES.find((x) => x.key === p.cycle);
  return c?.days ? `${c.label} · ${c.days} days, renew any time` : "One-time · never expires";
}

/** Where the welcome page finds the claim token after the processor sends the buyer back. */
export const guestTokenKey = (ref: string) => `xo:gjoin:${ref}`;

export function JoinCheckout({ community, plans }: { community: { id: string; name: string }; plans: JoinPlan[] }) {
  const router = useRouter();
  const { appUser, loading } = useAuth();
  const [selected, setSelected] = useState<string | null>(plans.find((p) => p.spotsLeft !== 0)?.id ?? null);
  const plan = plans.find((p) => p.id === selected) ?? null;
  const [step, setStep] = useState<"plans" | "details" | "code">("plans");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState<boolean | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once
    setInvite(new URLSearchParams(window.location.search).get("invite"));
  }, []);

  // Signed in: already a member? Then this page just opens the community.
  useEffect(() => {
    if (!appUser) return;
    let off = false;
    apiFetch(`/api/communities/${community.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !off && setMember(Boolean(d?.viewer?.membership?.active || d?.viewer?.isAdmin)))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [appUser, community.id]);

  useEffect(() => {
    if (step !== "plans") formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  if (plans.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-line p-5">
        <p className="text-[15px] text-ink-2">This community has no membership plans yet.</p>
        <Link href={appUser ? `/groups/${community.id}` : withNext("/signup", `/groups/${community.id}`)} className="mt-4 inline-block rounded-full bg-red px-5 py-3 text-sm font-bold text-white">
          {appUser ? "Open the community" : "Create an account to join"}
        </Link>
      </div>
    );
  }

  async function signedInJoin() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const gateway = plan.priceKobo > 0 ? await pickGateway() : undefined;
      const res = await apiFetch(`/api/communities/${community.id}/join`, {
        method: "POST",
        body: JSON.stringify({ planId: plan.id, gateway, inviteCode: invite ?? undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't join");
      if (d.status === "CHECKOUT") return window.location.assign(d.checkoutUrl);
      router.push(`/groups/${community.id}`);
    } catch (err) {
      if (err instanceof GatewayPickerCancelled) return;
      setError(err instanceof Error ? err.message : "Couldn't join");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setError(null);
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    if (phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(phone.trim())) return setError("That phone number doesn't look right.");
    setBusy(true);
    try {
      const res = await fetch("/api/guest-checkout/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't send the code");
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndPay() {
    if (!plan) return;
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from the email.");
    setBusy(true);
    try {
      const v = await fetch("/api/guest-checkout/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), code: code.trim() }) });
      const vd = await v.json().catch(() => ({}));
      if (!v.ok) throw new Error(typeof vd.error === "string" ? vd.error : "That code didn't work");
      const gateway = plan.priceKobo > 0 ? await pickGateway() : undefined;
      const res = await fetch(`/api/communities/${community.id}/guest-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, name: name.trim(), email: email.trim(), phone: phone.trim(), verificationToken: vd.verificationToken, gateway }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't start checkout");
      if (d.status === "CHECKOUT") {
        try {
          localStorage.setItem(guestTokenKey(d.ref), d.token);
        } catch {
          // storage blocked: the emailed link still opens the card
        }
        window.location.assign(d.checkoutUrl);
        return;
      }
      router.push(`/join/${community.id}/welcome?token=${d.token}`);
    } catch (err) {
      if (err instanceof GatewayPickerCancelled) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const needsAccount = Boolean(plan?.requiresApproval);
  const cta = !plan ? "Choose a plan" : plan.priceKobo === 0 ? "Join for free" : `Continue · ${planPriceLabel(plan)}`;

  return (
    <>
      <section className="mt-9">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-red-soft">Membership plans</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {plans.map((p) => {
            const full = p.spotsLeft === 0;
            const on = p.id === selected;
            return (
              <button
                key={p.id}
                type="button"
                disabled={full}
                onClick={() => {
                  setSelected(p.id);
                  setError(null);
                }}
                aria-pressed={on}
                className={`flex flex-col rounded-3xl border p-5 text-left transition-colors disabled:opacity-50 ${on ? "border-red bg-red/10" : "border-line bg-surface"}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[18px] font-bold leading-tight">{p.name}</span>
                  <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${on ? "border-red bg-red shadow-[inset_0_0_0_3px_#0b0b0b]" : "border-line"}`} aria-hidden />
                </span>
                <span className="mt-2 font-serif text-[28px] font-bold leading-none">{planPriceLabel(p)}</span>
                <span className="mt-1.5 text-[12.5px] text-ink-3">{durationLabel(p)}</span>
                {p.description && <span className="mt-3 text-[14px] text-ink-2">{p.description}</span>}
                {p.benefits.length > 0 && (
                  <span className="mt-3 flex flex-col gap-1.5">
                    {p.benefits.map((b) => (
                      <span key={b} className="flex items-start gap-2 text-[13.5px] text-ink-2">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-soft" />
                        {b}
                      </span>
                    ))}
                  </span>
                )}
                {(p.spotsLeft != null || p.requiresApproval) && (
                  <span className="mt-3 text-[12px] font-semibold text-red-soft">
                    {full ? "Full" : p.spotsLeft != null ? `${p.spotsLeft} spot${p.spotsLeft === 1 ? "" : "s"} left` : ""}
                    {p.requiresApproval ? `${p.spotsLeft != null ? " · " : ""}Needs approval` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div ref={formRef} className="mt-8 scroll-mt-4">
        {loading ? null : appUser ? (
          member ? (
            <Link href={`/groups/${community.id}`} className="block w-full rounded-full bg-red px-5 py-4 text-center text-[16px] font-bold text-white">
              You&apos;re a member · Open {community.name}
            </Link>
          ) : (
            <>
              <button type="button" disabled={!plan || busy} onClick={signedInJoin} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
                {busy ? "Processing…" : needsAccount ? "Apply to join" : cta}
              </button>
              <p className="mt-2 text-center text-[12.5px] text-ink-3">Signed in as {appUser.displayName}. The membership goes on this account.</p>
            </>
          )
        ) : needsAccount ? (
          <div className="rounded-3xl border border-line p-5 text-center">
            <p className="text-[15px] text-ink-2">An admin approves members on this plan, so applying needs a XOLDOUT account.</p>
            <Link href={withNext("/signup", `/groups/${community.id}`)} className="mt-4 inline-block rounded-full bg-red px-5 py-3 text-sm font-bold text-white">
              Create an account to apply
            </Link>
          </div>
        ) : step === "plans" ? (
          <>
            <button type="button" disabled={!plan} onClick={() => setStep("details")} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
              {cta}
            </button>
            <p className="mt-2 text-center text-[12.5px] text-ink-3">
              No account needed to join. You&apos;ll create one after{plan && plan.priceKobo > 0 ? " paying" : " joining"}.{" "}
              <Link href={withNext("/login", `/join/${community.id}`)} className="font-semibold text-ink-2 underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <div className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold">{step === "details" ? "Your details" : "Check your email"}</h2>
              <button type="button" onClick={() => setStep(step === "code" ? "details" : "plans")} className="text-[13px] font-semibold text-ink-3">
                Back
              </button>
            </div>
            {plan && (
              <p className="mt-1 text-[13.5px] text-ink-3">
                {plan.name} · {planPriceLabel(plan)}
              </p>
            )}

            {step === "details" ? (
              <form
                className="mt-4 flex flex-col gap-3"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <label className="text-[13px] font-semibold" htmlFor="gj-name">
                  Full name
                </label>
                <input id="gj-name" className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                <label className="text-[13px] font-semibold" htmlFor="gj-email">
                  Email address
                </label>
                <input id="gj-email" className={input} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label className="text-[13px] font-semibold" htmlFor="gj-phone">
                  Phone number <span className="font-normal text-ink-3">(optional)</span>
                </label>
                <input id="gj-phone" className={input} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
                {error && <p className="rounded-2xl border border-red/40 bg-red/10 px-4 py-3 text-[14px] text-red-soft">{error}</p>}
                <button type="submit" disabled={busy} className="mt-1 w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
                  {busy ? "Sending code…" : "Send me a code"}
                </button>
                <p className="text-center text-[12.5px] text-ink-3">We&apos;ll email you a 6-digit code to confirm it&apos;s your email.</p>
              </form>
            ) : (
              <form
                className="mt-4 flex flex-col gap-3"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyAndPay();
                }}
              >
                <p className="text-[14px] text-ink-2">
                  We sent a 6-digit code to <b className="text-ink">{email.trim()}</b>. It expires in 10 minutes.
                </p>
                <input
                  className={`${input} text-center text-[24px] font-bold tracking-[0.4em]`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="6-digit code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                {error && <p className="rounded-2xl border border-red/40 bg-red/10 px-4 py-3 text-[14px] text-red-soft">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
                  {busy ? "Please wait…" : plan && plan.priceKobo > 0 ? `Confirm and pay ${planPriceLabel(plan)}` : "Confirm and join"}
                </button>
                <button type="button" disabled={busy} onClick={sendCode} className="text-[13px] font-semibold text-ink-3 disabled:opacity-50">
                  Send a new code
                </button>
              </form>
            )}
          </div>
        )}
        {appUser && error && <p className="mt-3 rounded-2xl border border-red/40 bg-red/10 px-4 py-3 text-[14px] text-red-soft">{error}</p>}
      </div>
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
    </>
  );
}
