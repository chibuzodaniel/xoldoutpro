"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { signInWithCustomToken } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { CardFace, type MemberCard } from "@/components/communities/MembershipCardSheet";
import { guestTokenKey } from "@/components/communities/JoinCheckout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { withNext } from "@/lib/returnTo";

// After a guest membership checkout (2026-11-16): PAYMENT SUCCESSFUL →
// MEMBERSHIP CARD → CREATE ACCOUNT → LINKED → COMMUNITY. Reached from the
// processor's redirect (?tx_ref=, the claim token was kept in this browser)
// or from the emailed claim link (?token=), so it works later and on another
// device too. Account creation only happens here, after payment.

type View = {
  status: "PENDING" | "PAID" | "FAILED";
  community: { id: string; name: string; logoUrl: string | null };
  email: string;
  account: "needs_account" | "has_account" | "claimed";
  card: MemberCard | null;
};

const POLL_MS = 3000;
const TIMEOUT_MS = 90_000;

export default function JoinWelcomePage() {
  return (
    <Suspense fallback={null}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { appUser } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The claim token: from the link, or saved in this browser at checkout.
  useEffect(() => {
    let t = sp.get("token");
    const ref = sp.get("tx_ref") ?? sp.get("reference") ?? sp.get("ref");
    if (!t && ref) {
      try {
        t = localStorage.getItem(guestTokenKey(ref));
      } catch {
        t = null;
      }
    }
    /* eslint-disable react-hooks/set-state-in-effect -- read the address once */
    if (t) setToken(t);
    else setMissing(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sp]);

  // Poll while the payment is being confirmed.
  useEffect(() => {
    if (!token) return;
    let off = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function poll() {
      const res = await fetch(`/api/communities/guest-membership?token=${encodeURIComponent(token!)}`, { cache: "no-store" }).catch(() => null);
      if (off) return;
      if (res?.status === 404) return setMissing(true);
      if (res?.ok) {
        const v: View = await res.json();
        setView(v);
        if (v.status !== "PENDING") return;
      }
      if (Date.now() - started > TIMEOUT_MS) return setTimedOut(true);
      timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      off = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    if (!view?.card) return;
    QRCode.toDataURL(view.card.cardCode, { margin: 1, width: 512 }).then(setQr).catch(() => {});
  }, [view?.card]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    setError(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError("Use at least 8 characters, with a letter and a number.");
    setBusy(true);
    try {
      const res = await fetch("/api/communities/guest-membership/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't create your account");
      if (!firebaseAuth) throw new Error("Sign-in isn't available right now. Sign in with your email and new password.");
      await signInWithCustomToken(firebaseAuth, d.customToken);
      router.push(`/groups/${d.groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account");
      setBusy(false);
    }
  }

  const communityHref = `/groups/${view?.community.id ?? id}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-8">
      <Link href="/" className="text-[18px] font-extrabold tracking-wide">
        XOLD<span className="text-red-soft">OUT</span>
      </Link>

      {missing ? (
        <Box title="No membership to show yet">
          <p>
            If you cancelled the payment, nothing was charged. If you paid, open the link in your membership email; it works on any device.
          </p>
          <Link href={`/join/${id}`} className="mt-5 inline-block rounded-full bg-red px-5 py-3 text-sm font-bold text-white">
            Back to the plans
          </Link>
        </Box>
      ) : !view || (view.status === "PENDING" && !timedOut) ? (
        <div className="mt-24 flex flex-col items-center gap-4 text-center">
          <LoadingSpinner size="lg" />
          <h1 className="font-serif text-3xl">Confirming your payment</h1>
          <p className="text-sm text-ink-3">This usually takes a few seconds.</p>
        </div>
      ) : view.status === "PENDING" ? (
        <Box title="Still confirming">
          <p>Your payment is taking longer than usual to confirm. We&apos;ll email you the moment it does, with a link to your card and to create your account.</p>
        </Box>
      ) : view.status === "FAILED" ? (
        <Box title="Payment didn't go through">
          <p>Nothing was charged. You can try again.</p>
          <Link href={`/join/${view.community.id}`} className="mt-5 inline-block rounded-full bg-red px-5 py-3 text-sm font-bold text-white">
            Try again
          </Link>
        </Box>
      ) : (
        <>
          <div className="mt-8 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#fff" strokeWidth="3" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h1 className="mt-4 font-serif text-[30px] font-bold leading-tight">You&apos;re a member</h1>
            <p className="mt-1 text-[15px] text-ink-2">Welcome to {view.community.name}. Here&apos;s your membership card.</p>
          </div>

          {view.card && (
            <div className="mt-6">
              <CardFace card={view.card} qr={qr} />
              <p className="mt-2 text-center text-[12px] text-ink-3">Show the QR code at the door. It&apos;s checked against XOLDOUT&apos;s records when scanned.</p>
            </div>
          )}

          {view.account === "needs_account" && !appUser ? (
            <form onSubmit={createAccount} noValidate className="mt-7 rounded-3xl border border-line bg-surface p-5">
              <h2 className="text-[19px] font-bold">Create your XOLDOUT account</h2>
              <p className="mt-1 text-[14px] text-ink-3">Keep your card in the app and get into the community. Your membership links to it automatically.</p>
              <label className="mt-4 block text-[13px] font-semibold">Email</label>
              <input className="mt-1.5 w-full rounded-2xl border border-line bg-bg px-4 py-3.5 text-[16px] text-ink-2" value={view.email} readOnly aria-readonly />
              <label className="mt-3 block text-[13px] font-semibold" htmlFor="claim-pw">
                Choose a password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="claim-pw"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-line bg-bg px-4 py-3.5 pr-20 text-[16px] outline-none focus:border-red"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-[13px] font-semibold text-ink-3">
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-3">At least 8 characters, with a letter and a number.</p>
              {error && <p className="mt-3 rounded-2xl border border-red/40 bg-red/10 px-4 py-3 text-[14px] text-red-soft">{error}</p>}
              <button type="submit" disabled={busy} className="mt-4 w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
                {busy ? "Creating your account…" : "Create account and open the community"}
              </button>
              <p className="mt-3 text-center text-[12.5px] text-ink-3">
                Not now? We&apos;ve emailed you a link to do this later. Your membership is safe either way.
              </p>
            </form>
          ) : appUser ? (
            <Link href={communityHref} className="mt-7 block w-full rounded-full bg-red px-5 py-4 text-center text-[16px] font-bold text-white">
              Open {view.community.name}
            </Link>
          ) : (
            <div className="mt-7 rounded-3xl border border-line bg-surface p-5 text-center">
              <p className="text-[15px] text-ink-2">
                {view.account === "claimed" ? "This membership is linked to your account." : "This email already has a XOLDOUT account, so your membership is on it."} Sign in with{" "}
                <b className="text-ink">{view.email}</b> to open the community.
              </p>
              <Link href={withNext("/login", communityHref)} className="mt-4 inline-block rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
                Sign in
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-16 text-center">
      <h1 className="font-serif text-3xl">{title}</h1>
      <div className="mx-auto mt-3 max-w-sm text-[15px] text-ink-3">{children}</div>
    </div>
  );
}
