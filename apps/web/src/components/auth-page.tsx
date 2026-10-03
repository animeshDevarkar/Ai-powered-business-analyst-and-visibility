"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, Eye, EyeOff, Layers3, LoaderCircle, LockKeyhole, Radio, ShieldCheck, Sparkles } from "lucide-react";
import type { AuthConfig } from "@visibility/core";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "./theme-toggle";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const params = useSearchParams();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<AuthConfig>("/auth/config", { signal: controller.signal }).then(setConfig)
      .catch(() => { if (!controller.signal.aborted) setError("Unable to connect to account services. Please refresh and try again."); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config?.ready || busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (signup && password !== form.get("confirmPassword")) { setError("The passwords do not match."); return; }
    setBusy("email"); setError("");
    try {
      const result = signup
        ? await authClient.signUp.email({ name: String(form.get("name")).trim(), email, password })
        : await authClient.signIn.email({ email, password, rememberMe: form.get("remember") === "on" });
      if (result.error) { setError(result.error.message ?? "Unable to sign in. Please try again."); return; }
      router.replace("/"); router.refresh();
    } catch { setError("Unable to connect. Please try again in a moment."); }
    finally { setBusy(null); }
  }

  async function google() {
    if (!config?.google || busy) return;
    setBusy("google"); setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login?error=oauth" });
      if (result.error) setError(result.error.message ?? "Google sign-in could not start. Please try again.");
    } catch { setError("Google sign-in could not start. Please try again."); }
    finally { setBusy(null); }
  }

  return <div className="auth-shell">
    <header className="auth-header"><Link className="brand auth-brand" href="/login" aria-label="Analytiq home"><span className="brand-mark"><Layers3 size={23} /></span>Analytiq</Link><ThemeToggle /></header>
    <main className="auth-main">
      <section className="auth-story" aria-label="About Analytiq">
        <span className="auth-kicker"><Sparkles size={14} /> CLARITY IN THE AGE OF AI SEARCH</span>
        <h1>Your next customer<br />is asking AI.<br /><span>Be in the answer.</span></h1>
        <p>Understand how your business appears in AI search, and turn evidence into your next best move.</p>
        <div className="auth-flow" aria-hidden="true"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-flow-center"><Layers3 size={32} /></div><span className="flow-chip chip-memory"><BookOpen size={16} /> Business memory</span><span className="flow-chip chip-evidence"><Radio size={16} /> Search evidence</span><span className="flow-chip chip-review"><ShieldCheck size={16} /> Reviewed changes</span></div>
        <div className="auth-story-footer"><ShieldCheck size={18} /><span>Grounded in evidence. Guided by you.</span></div>
      </section>
      <section className="auth-form-section">
        <div className="auth-form-card"><span className="eyebrow">YOUR ANALYTIQ WORKSPACE</span><h2>{signup ? "Start with a clearer picture." : "Welcome back."}</h2><p className="auth-subtitle">{signup ? "Create your account to begin your AI visibility journey." : "Sign in to keep building your AI visibility."}</p>
          <button type="button" className="google-button" onClick={google} disabled={!config?.google || busy !== null}>
            {busy === "google" ? <LoaderCircle size={18} className="spin" /> : <GoogleMark />} Continue with Google
          </button>
          <div className="auth-divider"><span />or continue with email<span /></div>
          <form onSubmit={submit}>
            {signup && <label>Full name<input name="name" required maxLength={100} autoComplete="name" placeholder="Your name" disabled={busy !== null} /></label>}
            <label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" disabled={busy !== null} /></label>
            <label>Password<div className="password-field"><input name="password" type={showPassword ? "text" : "password"} required minLength={signup ? 12 : 1} maxLength={128} autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 12 characters" : "Enter your password"} disabled={busy !== null} /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {signup && <label>Confirm password<input name="confirmPassword" type={showPassword ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" placeholder="Enter your password again" disabled={busy !== null} /></label>}
            {!signup && <label className="checkbox-label auth-remember"><input name="remember" type="checkbox" defaultChecked /> Keep me signed in</label>}
            {(error || params.get("error")) && <div className="auth-error" role="alert">{error || "Google sign-in did not complete. Please try again or use your email."}</div>}
            {config && !config.ready && <p className="auth-service-note" role="status">Account services are being connected. Sign-in and account creation will be available soon.</p>}
            {config?.ready && !config.google && <p className="auth-service-note">Google sign-in is being connected. You can continue with email.</p>}
            <button type="submit" className="button primary auth-submit" disabled={!config?.ready || busy !== null}>{busy === "email" ? <LoaderCircle size={17} className="spin" /> : null}{signup ? "Create account" : "Sign in"}<ArrowRight size={17} /></button>
          </form>
          <p className="auth-switch">{signup ? "Already have an account?" : "New to Analytiq?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p>
          <div className="auth-security"><LockKeyhole size={13} /> A secure home for your business insights.</div>
        </div>
      </section>
    </main>
    <footer className="auth-footer"><span>Analytiq · AI visibility, backed by evidence.</span><span>Your next move starts with understanding.</span></footer>
  </div>;
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-14.9Z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.5H5.8V33A20 20 0 0 0 24 44Z" /><path fill="#FBBC05" d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18l6.8-5.2Z" /><path fill="#EA4335" d="M24 11.7c3 0 5.7 1 7.8 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.9 6.1-8.5 11.4-8.5Z" /></svg>;
}
