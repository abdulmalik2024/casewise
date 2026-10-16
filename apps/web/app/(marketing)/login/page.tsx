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
        disabled
        title="Google sign-in is coming soon"
        className="mt-3 w-full cursor-not-allowed rounded-xl border border-[#e3e1d5] bg-white px-4 py-2.5 text-sm font-medium text-[#a39f8d] opacity-60 dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-500"
      >
        Continue with Google — coming soon
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
