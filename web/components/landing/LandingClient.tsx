"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { rules, useAuthFlow, type AuthFailure } from "@/lib/auth/useAuthFlow";
import { returnTo, safePath } from "@/lib/returnTo";
import { Art } from "@/components/landing/Illustrations";

// Interactive parts of the landing page (xoldout-mockup.html, 2026-11-16):
// the sign-in / create-account dialog and its openers, the hero phone, the
// "Ways to earn" explorer and the chart time pills. Everything else on the
// page is static markup (app/page.tsx), so the page is prerendered once at
// build time and costs no server work per visit (web/CLAUDE.md CPU budget).

type Mode = "signup" | "signin" | "forgot";
type Ctx = { open: (mode: Mode) => void; signedIn: boolean };
const AuthCtx = createContext<Ctx>({ open: () => {}, signedIn: false });

export function LandingAuthProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser } = useAuth();
  const signedIn = Boolean(firebaseUser && appUser);
  const [mode, setMode] = useState<Mode | null>(null);
  const [next, setNext] = useState("/discover");
  const [initialError, setInitialError] = useState<string | null>(null);

  // ?auth=signin|signup opens the dialog, ?next= is where to land afterwards.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const auth = p.get("auth");
    /* eslint-disable react-hooks/set-state-in-effect -- read the address once on the client */
    setNext(returnTo(p.get("next")));
    if (p.get("auth_error")) setInitialError("We couldn’t finish signing you in with Google. Please try again.");
    if (auth === "signin" || auth === "signup" || p.get("auth_error")) setMode(auth === "signup" ? "signup" : "signin");
    /* eslint-enable react-hooks/set-state-in-effect */
    if (p.has("auth") || p.has("next") || p.has("auth_error")) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
  }, []);

  // Already signed in and sent here to sign in: carry on to where they were headed.
  useEffect(() => {
    if (signedIn && mode && safePath(next)) window.location.assign(next);
  }, [signedIn, mode, next]);

  const open = useCallback((m: Mode) => setMode(m), []);
  return (
    <AuthCtx.Provider value={{ open, signedIn }}>
      {children}
      <AuthDialog
        mode={mode}
        next={next}
        initialError={initialError}
        onMode={setMode}
        onClose={() => {
          setMode(null);
          setInitialError(null);
        }}
      />
    </AuthCtx.Provider>
  );
}

/** "Get Started" / "Sign in": opens the dialog, or "Open Xoldout" once signed in. */
export function AuthButton({ mode, className, children }: { mode: "signup" | "signin"; className: string; children: React.ReactNode }) {
  const { open, signedIn } = useContext(AuthCtx);
  if (signedIn) {
    return (
      <Link href="/discover" className={className}>
        Open Xoldout
      </Link>
    );
  }
  return (
    <button className={className} type="button" onClick={() => open(mode)}>
      {children}
    </button>
  );
}

/** In-page links scroll the page's own column (#app-scroll), smoothly. */
export function SectionLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        const el = document.getElementById(href.slice(1));
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}

// ─── Auth dialog ────────────────────────────────────────────────────────────

const COPY: Record<Mode, { title: string; sub: string }> = {
  signup: { title: "Create your account", sub: "Join Xoldout in seconds." },
  signin: { title: "Welcome back", sub: "Sign in to pick up where you left off." },
  forgot: { title: "Reset your password", sub: "Enter your email and we’ll send you a reset link." },
};

type Alert = { kind: "error" | "success" | "info"; text: string; action?: { label: string; run: () => void } } | null;

function GoogleIcon() {
  return (
    <svg className="ico" width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rule: (v: string) => string;
  error: string;
  setError: (msg: string) => void;
  type?: "text" | "email" | "password";
  autoComplete: string;
  placeholder: string;
  hint?: string;
};

function Field({ id, label, value, onChange, rule, error, setError, type = "text", autoComplete, placeholder, hint }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  const describedBy = [hint ? `${id}-hint` : "", `${id}-err`].filter(Boolean).join(" ");
  const input = (
    <input
      id={id}
      type={isPw && !show ? "password" : isPw ? "text" : type}
      inputMode={type === "email" ? "email" : undefined}
      autoCapitalize={type === "email" ? "none" : undefined}
      spellCheck={type === "email" ? false : undefined}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        onChange(e.target.value);
        if (error) setError(rule(e.target.value));
      }}
      onBlur={() => value && setError(rule(value))}
    />
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isPw ? (
        <div className="pw">
          {input}
          <button className="pw-toggle" type="button" aria-controls={id} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      ) : (
        input
      )}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <p className="field-err" id={`${id}-err`}>
        {error}
      </p>
    </div>
  );
}

function AuthDialog({
  mode,
  next,
  initialError,
  onMode,
  onClose,
}: {
  mode: Mode | null;
  next: string;
  initialError: string | null;
  onMode: (m: Mode) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const flow = useAuthFlow(next);
  const [alert, setAlert] = useState<Alert>(null);
  const [busy, setBusy] = useState<null | "form" | "google">(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<string | null>(null);
  const setErr = (k: string) => (msg: string) => setErrors((e) => ({ ...e, [k]: msg }));

  // Open/close the native dialog with the mode.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    if (!mode && d.open) d.close();
  }, [mode]);

  // A fresh view per mode; the email carries over between them.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form when the mode changes */
    setErrors({});
    setAlert(initialError ? { kind: "error", text: initialError } : null);
    setDeleted(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (mode && window.matchMedia("(hover: hover)").matches) {
      // Focus the first field on desktop only (no keyboard popping up on phones).
      requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>("form input")?.focus());
    }
  }, [mode, initialError]);

  function fail(r: AuthFailure) {
    setBusy(null);
    if (r.code === "deleted" && r.deletedHandle) return setDeleted(r.deletedHandle);
    if (r.field) setErr(r.field.name)(r.field.message);
    setAlert({
      kind: "error",
      text: r.message,
      action: r.code === "email_taken" ? { label: "Sign in instead", run: () => onMode("signin") } : undefined,
    });
  }

  function validate(fields: [string, string, (v: string) => string][]) {
    const found: Record<string, string> = {};
    for (const [k, v, rule] of fields) found[k] = rule(v);
    setErrors(found);
    const first = fields.find(([k]) => found[k]);
    if (first) ref.current?.querySelector<HTMLInputElement>(`#xl-${first[0]}`)?.focus();
    return !first;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !mode) return;
    setAlert(null);
    if (mode === "signup") {
      if (!validate([["name", name, rules.name], ["email", email, rules.email], ["password", password, rules.newPassword]])) return;
      setBusy("form");
      const r = await flow.signUp(name, email, password);
      if (!r.ok) return fail(r);
      setAlert({ kind: "success", text: "You’re in. Taking you to Xoldout…" });
      setTimeout(r.go, 700);
    } else if (mode === "signin") {
      if (!validate([["email", email, rules.email], ["password", password, rules.password]])) return;
      setBusy("form");
      const r = await flow.signIn(email, password);
      if (!r.ok) return fail(r);
      setAlert({ kind: "success", text: "Welcome back. Taking you to Xoldout…" });
      setTimeout(r.go, 700);
    } else {
      if (!validate([["email", email, rules.email]])) return;
      setBusy("form");
      const r = await flow.sendReset(email);
      setBusy(null);
      setAlert({ kind: r.ok ? "success" : "error", text: r.message });
    }
  }

  async function google() {
    if (busy || !mode || mode === "forgot") return;
    setAlert(null);
    setBusy("google");
    const r = await flow.google(mode);
    if (!r.ok) return fail(r);
    setAlert({ kind: "success", text: "Signed in with Google. Taking you to Xoldout…" });
    setTimeout(r.go, 700);
  }

  const m = mode ?? "signup";
  const choices = m === "signup" || m === "signin";
  const submitLabel = { signup: ["Create account", "Creating account…"], signin: ["Sign in", "Signing in…"], forgot: ["Send reset link", "Sending link…"] }[m];

  return (
    <dialog
      id="auth"
      ref={ref}
      aria-labelledby="authTitle"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="auth-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="auth-card">
          <button className="auth-x" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
          <span className="logo">XOLDOUT</span>

          {deleted ? (
            <>
              <h2 id="authTitle">You deleted this account</h2>
              <p className="auth-sub">It&apos;s still within its 45-day recovery window, so you can get it back.</p>
              <Link className="btn btn-primary btn-block btn-pill" href={`/recoveraccount/${deleted}`}>
                <span className="lbl">Recover my account</span>
              </Link>
            </>
          ) : (
            <>
              <h2 id="authTitle">{COPY[m].title}</h2>
              <p className="auth-sub">{COPY[m].sub}</p>

              {choices && (
                <div className="seg" role="tablist" aria-label="Sign in or create an account">
                  <button type="button" role="tab" aria-selected={m === "signup"} onClick={() => onMode("signup")}>
                    Create account
                  </button>
                  <button type="button" role="tab" aria-selected={m === "signin"} onClick={() => onMode("signin")}>
                    Sign in
                  </button>
                </div>
              )}

              {alert && (
                <div className={`alert ${alert.kind}`} role="alert">
                  <span>{alert.text}</span>
                  {alert.action && (
                    <button type="button" onClick={alert.action.run}>
                      {alert.action.label}
                    </button>
                  )}
                </div>
              )}

              {choices && (
                <>
                  <button className={`btn btn-google btn-block btn-pill ${busy === "google" ? "loading" : ""}`} type="button" disabled={Boolean(busy)} onClick={google}>
                    <GoogleIcon />
                    <span className="lbl">{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
                  </button>
                  <div className="or">
                    <span>or use your email</span>
                  </div>
                </>
              )}

              <form noValidate onSubmit={submit} aria-busy={busy === "form" || undefined}>
                {m === "signup" && (
                  <Field id="xl-name" label="Full name" value={name} onChange={setName} rule={rules.name} error={errors.name ?? ""} setError={setErr("name")} autoComplete="name" placeholder="Your name" />
                )}
                <Field id="xl-email" label="Email address" type="email" value={email} onChange={setEmail} rule={rules.email} error={errors.email ?? ""} setError={setErr("email")} autoComplete="email" placeholder="you@email.com" />
                {m !== "forgot" && (
                  <Field
                    id="xl-password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    rule={m === "signup" ? rules.newPassword : rules.password}
                    error={errors.password ?? ""}
                    setError={setErr("password")}
                    autoComplete={m === "signup" ? "new-password" : "current-password"}
                    placeholder={m === "signup" ? "Create a password" : "Your password"}
                    hint={m === "signup" ? "At least 8 characters, with a letter and a number." : undefined}
                  />
                )}
                {m === "signin" && (
                  <div className="row-between">
                    <button className="linkbtn" type="button" onClick={() => onMode("forgot")}>
                      Forgot password?
                    </button>
                  </div>
                )}
                <button className={`btn btn-primary btn-block btn-pill ${busy === "form" ? "loading" : ""}`} type="submit" disabled={Boolean(busy)}>
                  <span className="lbl">{busy === "form" ? submitLabel[1] : submitLabel[0]}</span>
                </button>
                {m === "signup" && (
                  <p className="legal">
                    By continuing you agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
                  </p>
                )}
                {m === "forgot" && (
                  <button className="linkbtn back" type="button" onClick={() => onMode("signin")}>
                    Back to sign in
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ─── Hero phone ─────────────────────────────────────────────────────────────

const SCREENS = ["discover", "socials", "drop", "library", "profile"] as const;
type Screen = (typeof SCREENS)[number];

function Row({ cover = "", title, sub, cta }: { cover?: string; title: string; sub: string; cta: string }) {
  return (
    <div className="row">
      <div className={`cover ${cover}`} />
      <div>
        <b>{title}</b>
        <small>{sub}</small>
      </div>
      <span className="mini">{cta}</span>
    </div>
  );
}

function PhoneScreen({ id }: { id: Screen }) {
  switch (id) {
    case "discover":
      return (
        <>
          <div className="p-top">
            <span className="p-logo">XOLDOUT</span>
            <span className="p-ico">
              <i />
              <i />
            </span>
          </div>
          <div className="p-tabs">
            <span className="on">For You</span>
            <span>Following</span>
            <span>Charts</span>
          </div>
          <div className="chips">
            <span className="chip on">Music</span>
            <span className="chip">Beats</span>
            <span className="chip">Events</span>
            <span className="chip">Merch</span>
          </div>
          <Row title="Midnight Run" sub="Sample Artist" cta="Play" />
          <Row cover="k2" title="Soft Landing" sub="Sample Artist" cta="Play" />
          <Row cover="k3" title="Rooftop Session" sub="Event, tickets available" cta="View" />
          <Row title="Tour hoodie" sub="Merch, sizes and colours" cta="Buy" />
        </>
      );
    case "socials":
      return (
        <>
          <div className="p-top">
            <span className="p-logo">Socials</span>
            <span className="p-ico">
              <i />
              <i />
            </span>
          </div>
          <div className="p-tabs">
            <span className="on">For You</span>
            <span>Following</span>
          </div>
          <div className="card-p">
            <span className="live-dot">LIVE NOW</span>
            <p style={{ marginTop: 6 }}>
              <b>Sample Artist</b> is live
            </p>
            <div className="bubble">Play the new one!</div>
            <div className="gifts">
              {["Star", "Mic", "Grammy", "Coin", "Money Spray"].map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
          </div>
          <div className="card-p">
            <b>New song Friday</b>
            <p style={{ color: "#aaa", marginTop: 4 }}>Pre-save and come hang out in the community.</p>
            <div className="share">
              <div className="cover" style={{ width: 36, height: 36 }} />
              <div>
                <b>Midnight Run</b>
                <br />
                <small style={{ color: "#999" }}>Tap to open song</small>
              </div>
            </div>
          </div>
        </>
      );
    case "drop":
      return (
        <>
          <div className="p-top">
            <span className="p-logo">Drop</span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>What are you dropping?</p>
          {[
            ["Music", "Upload a song, add bonus items"],
            ["Beat", "Set license types and prices"],
            ["Event", "Tickets, lineup, venue"],
            ["Merch", "Physical or digital"],
          ].map(([t, s]) => (
            <div key={t} className="drop-opt">
              <div className="sq" />
              <div>
                <strong>{t}</strong>
                <small>{s}</small>
              </div>
            </div>
          ))}
        </>
      );
    case "library":
      return (
        <>
          <div className="p-top">
            <span className="p-logo">Library</span>
            <span className="p-ico">
              <i />
            </span>
          </div>
          <div className="p-tabs" style={{ gap: 10, fontSize: 11.5 }}>
            <span className="on">Purchased</span>
            <span>Your Playlist</span>
            <span>Subscriptions</span>
            <span>Events</span>
          </div>
          <Row title="Midnight Run" sub="Purchased, yours to keep" cta="Play" />
          <Row cover="k3" title="Soft Landing" sub="Bonus item included" cta="Play" />
          <div className="ticket">
            <div>
              <b>Rooftop Session</b>
              <br />
              <small style={{ color: "#999" }}>Your ticket. Show at the door.</small>
            </div>
            <div className="qr">
              <div />
            </div>
          </div>
        </>
      );
    case "profile":
      return (
        <>
          <div className="cover-img" />
          <div className="avatar" />
          <p style={{ marginTop: 6, fontSize: 16 }}>
            <b>Sample Artist</b>
          </p>
          <small style={{ color: "#999" }}>@sampleartist</small>
          <div className="btnrow">
            <span>Message</span>
            <span>Tip</span>
            <span className="fill">Follow</span>
            <span>Subscribe to Catalog</span>
          </div>
          <div className="p-tabs">
            <span className="on">Music</span>
            <span>Events</span>
            <span>Merch</span>
          </div>
          <div className="grid2">
            <div>
              <div className="cover" />
              <b>Midnight Run</b>
            </div>
            <div>
              <div className="cover k2" />
              <b>Soft Landing</b>
            </div>
          </div>
        </>
      );
  }
}

export function PhonePreview() {
  const [screen, setScreen] = useState<Screen>("discover");
  return (
    <div className="phone-wrap">
      <div className="phone" role="group" aria-label="Interactive preview of the Xoldout app">
        <div className="screen">
          <section className="scr">
            <PhoneScreen id={screen} />
          </section>
        </div>
        <nav className="pnav" aria-label="App preview navigation">
          {SCREENS.map((s) => (
            <button key={s} type="button" className={s === "drop" ? "drop" : undefined} aria-current={screen === s ? "true" : undefined} onClick={() => setScreen(s)}>
              <span className="dot">{s === "drop" ? "+" : null}</span>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </nav>
      </div>
      <p className="phone-cap">Illustrative screens. Tap the tabs to look around.</p>
    </div>
  );
}

// ─── Ways to earn ───────────────────────────────────────────────────────────

const EARN: { name: string; title: string; what: string; points: React.ReactNode[]; good: string }[] = [
  {
    name: "Songs",
    title: "Sell songs fans keep",
    what: "Upload a song and set your price. Buyers keep it in their Library.",
    points: [
      <>
        <strong>Play All and Preview All</strong> on your profile let fans hear before they buy.
      </>,
      <>
        <strong>Bonus items</strong> like merch, other digital items or collectibles can come included with a purchase.
      </>,
      <>
        Add <strong>optional paid add-ons</strong> that show on the details page.
      </>,
    ],
    good: "Individual song sales stay available even when you offer a catalog subscription.",
  },
  {
    name: "Catalog subscription",
    title: "Let fans subscribe to your music",
    what: "Set your own price and duration. Subscribers get access to your music catalog for that time.",
    points: [
      <>
        The details page shows <strong>price, billing period, what&apos;s included</strong> and renewal or expiry.
      </>,
      <>Renewals, cancellations and expiry are handled for you.</>,
      <>
        Fans find it as <strong>Subscribe to Catalog</strong> on your profile.
      </>,
    ],
    good: "Catalog subscriptions cover music only, not beats, merch or events.",
  },
  {
    name: "Beats",
    title: "License beats to artists",
    what: "Producers upload a beat and create license cards, each with its own price.",
    points: [
      <>
        Choose formats: <strong>MP3, WAV or STEMS</strong>.
      </>,
      <>Spell out usage rights: commercial use, monetization, distribution, music videos, YouTube and social, radio, live, Content ID, and a streaming limit.</>,
      <>
        Buyers see terms before paying and get a <strong>downloadable licensing agreement</strong> afterwards.
      </>,
    ],
    good: "Beats also appear under Discover, with their own search and categories.",
  },
  {
    name: "Events",
    title: "Sell tickets to your show",
    what: "Create a physical, virtual or hybrid event with ticket tiers and a full details page.",
    points: [
      <>Add a poster, description, date, time, venue, category and tags.</>,
      <>
        Build your <strong>lineup</strong> from registered Xoldout accounts. They&apos;re notified and their names link to their profiles.
      </>,
      <>
        Tickets are <strong>QR codes</strong>, with check-in, attendee management, referrals and sales tracking.
      </>,
      <>
        Optionally buy <strong>paid promotional add-ons</strong> to reach more people.
      </>,
    ],
    good: "Events don’t have tipping. The money comes from your ticket tiers.",
  },
  {
    name: "Merch",
    title: "Sell merch, physical or digital",
    what: "Choose physical or digital when you upload.",
    points: [
      <>
        Physical merch supports <strong>sizes, colours, a size guide, quantity and stock</strong>. The image changes with the colour.
      </>,
      <>
        Fans can <strong>Add to Cart</strong> or <strong>Buy Now</strong>.
      </>,
      <>Attach merch to a release as a bonus, or list it on its own.</>,
    ],
    good: "Your merch shows up on your profile under the Merch tab.",
  },
  {
    name: "Go Live",
    title: "Go live and get rewarded",
    what: "Stream to your fans in real time and let them respond with Xoldout Gifts.",
    points: [
      <>
        Fans chat live and send gifts: <strong>Star, Mic, Grammy, Coin or Money Spray</strong>.
      </>,
      <>
        Track what you earn in your <strong>artist earnings dashboard</strong>.
      </>,
      <>Moderation tools help you keep the room friendly.</>,
    ],
    good: "No replays are saved. If fans want to be there, they have to show up.",
  },
  {
    name: "Communities",
    title: "Run a community and charge for access",
    what: "Start a Telegram-style community inside Socials with an announcements channel and topic discussions.",
    points: [
      <>
        Make it <strong>free, paid or mixed</strong>. Set plan name, price, monthly, yearly or one-time billing, benefits, capacity and approval rules.
      </>,
      <>
        Create <strong>tiers</strong> with different feature access.
      </>,
      <>
        Members get a <strong>membership card with a QR code</strong> that&apos;s verified live.
      </>,
      <>Use the organizer dashboard to see members, revenue and settings.</>,
    ],
    good: "Fans find it with the Community button next to Follow on your profile.",
  },
  {
    name: "Tips",
    title: "Let fans say thanks",
    what: "Fans can tip you directly from your artist profile or from your music.",
    points: [
      <>
        The <strong>Tip button</strong> sits right on your profile next to Message and Follow.
      </>,
      <>Tipping is personal support, separate from buying something.</>,
    ],
    good: "Tips are only on artist profiles and music. Beats, merch and events never show a tip button.",
  },
];

export function EarnExplorer() {
  const [i, setI] = useState(0);
  const tabs = useRef<HTMLDivElement>(null);
  const it = EARN[i];
  function onKey(e: React.KeyboardEvent, idx: number) {
    const n = EARN.length;
    let to: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") to = (idx + 1) % n;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = (idx - 1 + n) % n;
    if (to === null) return;
    e.preventDefault();
    setI(to);
    (tabs.current?.children[to] as HTMLElement | undefined)?.focus();
  }
  return (
    <div className="explorer">
      <div className="tabs" role="tablist" aria-label="Ways to earn" aria-orientation="vertical" ref={tabs}>
        {EARN.map((e, idx) => (
          <button key={e.name} type="button" role="tab" id={`earn-tab-${idx}`} aria-selected={idx === i} tabIndex={idx === i ? 0 : -1} onClick={() => setI(idx)} onKeyDown={(ev) => onKey(ev, idx)}>
            {e.name}
          </button>
        ))}
      </div>
      <div className="panel" role="tabpanel" aria-labelledby={`earn-tab-${i}`} aria-live="polite" tabIndex={0}>
        <div className="pgrid">
          <div>
            <h3>{it.title}</h3>
            <p className="what">{it.what}</p>
            <ul>
              {it.points.map((p, k) => (
                <li key={k}>{p}</li>
              ))}
            </ul>
            <p className="good">{it.good}</p>
          </div>
          <Art name={it.name} />
        </div>
      </div>
    </div>
  );
}

// ─── Chart time pills ───────────────────────────────────────────────────────

const PILLS: Record<string, string> = {
  Today: "Today: see who is moving right now. A good window for new releases and fresh talent.",
  "This Week": "This Week: a short run that rewards consistent releases and live shows.",
  "This Month": "This Month: a longer view that shows who keeps fans coming back.",
  "All Time": "All Time: the biggest names and bestsellers since Xoldout began.",
};

export function ChartPills() {
  const [t, setT] = useState("Today");
  return (
    <>
      <div className="pills" role="group" aria-label="Chart time filter">
        {Object.keys(PILLS).map((k) => (
          <button key={k} type="button" aria-pressed={k === t} onClick={() => setT(k)}>
            {k}
          </button>
        ))}
      </div>
      <p className="pill-out" aria-live="polite">
        {PILLS[t]}
      </p>
    </>
  );
}
