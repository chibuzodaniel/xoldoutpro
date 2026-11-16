"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { rules, useAuthFlow, type AuthFailure } from "@/lib/auth/useAuthFlow";
import { returnTo } from "@/lib/returnTo";
import { useInstallGuide } from "@/components/pwa/InstallGuideProvider";
import "@/app/(auth)/join.css";

// /signup and /login (xoldout-signup.html, explicit ask 2026-11-16): one card
// with Create account / Sign in tabs, Google first, floating-label fields,
// a password strength meter, and a "You're in" screen before going on.
// Styles: app/(auth)/join.css, scoped under .xj.

type Mode = "signup" | "signin";
type FieldName = "name" | "email" | "pass";

function score(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  return p ? Math.max(s, 1) : 0;
}
const HINTS = ["At least 8 characters, with a letter and a number", "Too short — add more characters", "Okay — add a number or capital letter", "Good", "Strong"];

export function JoinCard({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [next, setNext] = useState("/discover");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once on the client
    setNext(returnTo(new URLSearchParams(window.location.search).get("next")));
  }, []);
  const flow = useAuthFlow(next);
  const installGuide = useInstallGuide();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [banner, setBanner] = useState<{ kind: "err" | "info"; text: string; swap?: Mode } | null>(null);
  const [busy, setBusy] = useState<null | "form" | "google">(null);
  const [done, setDone] = useState<{ title: string; go: () => void } | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const focusField = (f: FieldName) => (f === "name" ? nameRef : f === "email" ? emailRef : passRef).current?.focus();

  const up = mode === "signup";
  const ruleFor = (f: FieldName) => (f === "name" ? rules.name : f === "email" ? rules.email : up ? rules.newPassword : rules.password);
  const values: Record<FieldName, string> = { name, email, pass };

  function check(f: FieldName, v = values[f]) {
    const msg = ruleFor(f)(v);
    setErrors((e) => ({ ...e, [f]: msg }));
    setTouched((t) => ({ ...t, [f]: true }));
    return !msg;
  }

  function switchMode(m: Mode) {
    setMode(m);
    setBanner(null);
    setErrors({});
    setTouched({});
  }

  // "You're in" for a moment, then on into the app (or onboarding for new accounts).
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(done.go, 2200);
    return () => clearTimeout(t);
  }, [done]);

  function fail(r: AuthFailure) {
    setBusy(null);
    if (r.code === "deleted" && r.deletedHandle) return setDeleted(r.deletedHandle);
    if (r.field) setErrors((e) => ({ ...e, [r.field!.name === "password" ? "pass" : "email"]: r.field!.message }));
    setBanner({
      kind: "err",
      text: r.code === "email_taken" ? "That email already has an account." : r.message,
      swap: r.code === "email_taken" ? "signin" : undefined,
    });
  }

  function finish(displayName: string | null, isNew: boolean, go: () => void) {
    const first = (displayName ?? "").trim().split(" ")[0];
    setDone({ title: isNew ? `You're in${first ? `, ${first}` : ""}.` : `Welcome back${first ? `, ${first}` : ""}.`, go });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBanner(null);
    const fields: FieldName[] = up ? ["name", "email", "pass"] : ["email", "pass"];
    const bad = fields.filter((f) => !check(f));
    if (bad.length) return focusField(bad[0]);
    setBusy("form");
    const r = up ? await flow.signUp(name, email, pass) : await flow.signIn(email, pass);
    if (!r.ok) return fail(r);
    setBusy(null);
    finish(r.name ?? (up ? name : null), up, r.go);
  }

  async function google() {
    if (busy) return;
    setBanner(null);
    setBusy("google");
    const r = await flow.google(mode);
    if (!r.ok) return fail(r);
    setBusy(null);
    finish(r.name, up, r.go);
  }

  async function forgot() {
    if (!check("email")) return focusField("email");
    const r = await flow.sendReset(email);
    setBanner({ kind: r.ok ? "info" : "err", text: r.ok ? `Reset link sent to ${email.trim()} if it has an account. Check your inbox.` : r.message });
  }

  const s = score(pass);
  const fieldClass = (f: FieldName, hidden = false) => `field ${f === "pass" ? "tall" : ""} ${hidden ? "hide" : ""} ${errors[f] ? "invalid" : touched[f] && values[f] ? "valid" : ""}`;

  return (
    <div className="xj">
      <main className="wrap">
        <div className="brand">
          <Link href="/" className="logo" style={{ color: "inherit", textDecoration: "none" }}>
            XOLD<i>OUT</i>
          </Link>
        </div>

        <h1 className="tagline">
          {up ? (
            <>
              Join the independent scene. <span>Takes 10 seconds.</span>
            </>
          ) : (
            <>
              Welcome back. <span>Your scene is waiting.</span>
            </>
          )}
        </h1>

        <section className="card">
          {deleted ? (
            <div className="done show" style={{ display: "block" }}>
              <h2>You deleted this account</h2>
              <p>It&apos;s still within its 45-day recovery window, so you can get it back.</p>
              <Link className="cta" href={`/recoveraccount/${deleted}`} style={{ textDecoration: "none" }}>
                Recover my account
              </Link>
            </div>
          ) : done ? (
            <div className="done show" aria-live="polite">
              <div className="check">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h2>{done.title}</h2>
              <p>Taking you to your feed…</p>
              <button className="cta" type="button" onClick={done.go}>
                Continue
              </button>
            </div>
          ) : (
            <div>
              <div className="tabs" data-mode={mode} role="tablist">
                <div className="pill" />
                <button type="button" role="tab" aria-selected={up} onClick={() => switchMode("signup")}>
                  Create account
                </button>
                <button type="button" role="tab" aria-selected={!up} onClick={() => switchMode("signin")}>
                  Sign in
                </button>
              </div>

              <button className="google" type="button" onClick={google} disabled={Boolean(busy)}>
                <svg viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
                  <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                <span>{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
              </button>

              <div className="or">or use email</div>

              {banner && (
                <div className={`banner ${banner.kind}`} role="alert">
                  {banner.text}{" "}
                  {banner.swap && (
                    <button type="button" onClick={() => switchMode(banner.swap!)}>
                      {banner.swap === "signin" ? "Sign in instead" : "Create one"}
                    </button>
                  )}
                </div>
              )}

              <form noValidate onSubmit={submit}>
                <div className={fieldClass("name", !up)}>
                  <div className="box">
                    <input
                      ref={nameRef}
                      id="xj-name"
                      type="text"
                      autoComplete="name"
                      placeholder=" "
                      value={name}
                      tabIndex={up ? undefined : -1}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) check("name", e.target.value);
                      }}
                      onBlur={() => name && check("name")}
                    />
                    <label htmlFor="xj-name">Full name</label>
                  </div>
                  <div className="msg">{errors.name}</div>
                </div>

                <div className={fieldClass("email")}>
                  <div className="box">
                    <input
                      ref={emailRef}
                      id="xj-email"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoComplete="email"
                      placeholder=" "
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) check("email", e.target.value);
                        if (banner?.kind === "err") setBanner(null);
                      }}
                      onBlur={() => email && check("email")}
                    />
                    <label htmlFor="xj-email">Email</label>
                  </div>
                  <div className="msg">{errors.email}</div>
                </div>

                <div className={fieldClass("pass")}>
                  <div className="box">
                    <input
                      ref={passRef}
                      id="xj-pass"
                      type={showPass ? "text" : "password"}
                      autoComplete={up ? "new-password" : "current-password"}
                      placeholder=" "
                      value={pass}
                      onChange={(e) => {
                        setPass(e.target.value);
                        if (errors.pass) check("pass", e.target.value);
                      }}
                      onBlur={() => pass && check("pass")}
                    />
                    <label htmlFor="xj-pass">Password</label>
                    <button className="eye" type="button" aria-label={showPass ? "Hide password" : "Show password"} onClick={() => setShowPass((v) => !v)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                        {showPass && <line x1="3" y1="3" x2="21" y2="21" />}
                      </svg>
                    </button>
                  </div>
                  {up && (
                    <>
                      <div className="strength" data-s={s}>
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className="hint">{HINTS[pass && pass.length < 8 ? 1 : s]}</div>
                    </>
                  )}
                  <div className="msg">{errors.pass}</div>
                </div>

                {!up && (
                  <div className="row">
                    <a role="button" tabIndex={0} onClick={forgot} onKeyDown={(e) => e.key === "Enter" && forgot()}>
                      Forgot password?
                    </a>
                  </div>
                )}

                <button className={`cta ${busy === "form" ? "loading" : ""}`} type="submit" disabled={Boolean(busy)}>
                  <span className="spin" />
                  <span>{up ? "Create account" : "Sign in"}</span>
                </button>
              </form>

              {up && (
                <p className="legal">
                  By continuing you agree to our <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
                </p>
              )}
            </div>
          )}
        </section>

        {/* The install steps lived on the old sign-up page (explicit ask); kept as one quiet link. */}
        <p className="legal" style={{ marginTop: 22 }}>
          <button
            type="button"
            onClick={() => (installGuide.canInstall ? installGuide.promptInstall() : installGuide.open())}
            style={{ background: "none", border: 0, color: "#fff", textDecoration: "underline", font: "inherit", cursor: "pointer" }}
          >
            Install the XOLDOUT app on your phone
          </button>
        </p>
      </main>
    </div>
  );
}
