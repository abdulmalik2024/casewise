"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/app");
  }

  async function signInWithGoogle() {
    setError("");
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-3xl tracking-tight [font-family:var(--font-serif)]">Sign in</h1>
      <p className="mt-1 text-sm text-[#8a8571] dark:text-neutral-400">
        Welcome back, counselor.
      </p>
      <form onSubmit={signIn} className="mt-8 space-y-3">
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
          placeholder="Password"
          className="w-full rounded-xl border border-[#e3e1d5] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
        />
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[#1e3a5a] px-4 py-2.5 font-medium text-white hover:bg-[#16304b] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button
        onClick={signInWithGoogle}
        className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#e3e1d5] bg-white px-4 py-2.5 text-sm font-medium text-[#3d3929] hover:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-200"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Continue with Google
      </button>
      <p className="mt-6 text-center text-sm text-[#8a8571]">
        New to Casewise?{" "}
        <Link href="/signup" className="font-medium text-[#1e3a5a] hover:underline dark:text-blue-400">
          Start your free trial
        </Link>
      </p>
    </main>
  );
}
