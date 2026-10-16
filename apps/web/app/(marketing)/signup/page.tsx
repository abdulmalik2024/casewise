"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase().auth.signUp({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else if (data.session) router.push("/app");
    else setCheckEmail(true); // email confirmation flow
  }

  async function google() {
    setError("");
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) setError(error.message);
  }

  if (checkEmail) {
    return (
      <main className="mx-auto max-w-sm px-6 py-16 text-center">
        <h1 className="text-3xl tracking-tight [font-family:var(--font-serif)]">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-[#5d5848] dark:text-neutral-300">
          We sent a confirmation link to <strong>{email}</strong>. Click it and you&apos;ll
          land in Casewise with your 7-day trial running.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-3xl tracking-tight [font-family:var(--font-serif)]">
        Start your free trial
      </h1>
      <p className="mt-1 text-sm text-[#8a8571] dark:text-neutral-400">
        7 days, full access, no credit card. For licensed attorneys.
      </p>
      <form onSubmit={signUp} className="mt-8 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="w-full rounded-xl border border-[#e3e1d5] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          className="w-full rounded-xl border border-[#e3e1d5] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
        />
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[#1e3a5a] px-4 py-2.5 font-medium text-white hover:bg-[#16304b] disabled:opacity-50"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <button
        onClick={google}
        className="mt-3 w-full rounded-xl border border-[#e3e1d5] bg-white px-4 py-2.5 text-sm font-medium text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300"
      >
        Continue with Google
      </button>
      <p className="mt-6 text-center text-sm text-[#8a8571]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#1e3a5a] hover:underline dark:text-blue-400">
          Sign in
        </Link>
      </p>
    </main>
  );
}
