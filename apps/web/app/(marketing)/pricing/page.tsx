"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function UpgradeButton({ plan, label }: { plan: "monthly" | "yearly"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upgrade() {
    setBusy(true);
    setMsg("");
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/signup");
        return;
      }
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 503) {
        setMsg("Billing is being switched on — check back shortly.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setMsg("Could not start checkout — try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={upgrade}
        disabled={busy}
        className="mt-6 block w-full rounded-xl bg-[#1e3a5a] px-5 py-2.5 text-center font-medium text-white hover:bg-[#16304b] disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : label}
      </button>
      {msg && <p className="mt-2 text-xs text-[#8a8571] dark:text-neutral-400">{msg}</p>}
    </>
  );
}

export default function Pricing() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">Pricing</h1>
      <p className="mt-2 text-[#6b6450] dark:text-neutral-400">
        Simple, self-serve, no sales calls. Built for solo and small-firm practice.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-[#e3e1d5] bg-white p-8 dark:border-neutral-700 dark:bg-[#30302e]">
          <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">Free trial</h3>
          <div className="mt-2 text-3xl font-semibold [font-family:var(--font-serif)]">
            $0 <span className="text-sm font-normal text-[#8a8571]">for 7 days</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-[#5d5848] dark:text-neutral-300">
            <li>✓ Full access to everything</li>
            <li>✓ No credit card required</li>
            <li>✓ Cancel by simply walking away</li>
          </ul>
          <Link
            href="/signup"
            className="mt-6 block rounded-xl bg-[#1e3a5a] px-5 py-2.5 text-center font-medium text-white hover:bg-[#16304b]"
          >
            Start free
          </Link>
        </div>

        <div className="rounded-2xl border-2 border-[#1e3a5a] bg-white p-8 dark:bg-[#30302e]">
          <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">
            Professional
            <span className="ml-2 rounded-full bg-[#efede3] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
              early-adopter pricing
            </span>
          </h3>
          <div className="mt-2 text-3xl font-semibold [font-family:var(--font-serif)]">
            $99.99 <span className="text-sm font-normal text-[#8a8571]">per attorney / month</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-[#5d5848] dark:text-neutral-300">
            <li>✓ Full daily practice use — Ask, Search, Check cites, IRAC drafts</li>
            <li>✓ Word memo exports with verification appendix</li>
            <li>✓ Building records and point-in-time research</li>
            <li>✓ Priority support and feature input</li>
          </ul>
          <UpgradeButton plan="monthly" label="Upgrade — $99.99/month" />
          <p className="mt-3 text-xs text-[#8a8571] dark:text-neutral-400">
            Upgrade any time — including during your free trial. Early adopters lock this rate.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e3e1d5] bg-white p-8 dark:border-neutral-700 dark:bg-[#30302e]">
          <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">
            Professional — Annual
            <span className="ml-2 rounded-full bg-[#efede3] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
              2 months free
            </span>
          </h3>
          <div className="mt-2 text-3xl font-semibold [font-family:var(--font-serif)]">
            $999.99 <span className="text-sm font-normal text-[#8a8571]">per attorney / year</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-[#5d5848] dark:text-neutral-300">
            <li>✓ Everything in Professional</li>
            <li>✓ Two months free vs. paying monthly</li>
            <li>✓ One invoice for the year</li>
          </ul>
          <UpgradeButton plan="yearly" label="Upgrade — $999.99/year" />
          <p className="mt-3 text-xs text-[#8a8571] dark:text-neutral-400">
            Upgrade any time — including during your free trial.
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs text-[#8a8571] dark:text-neutral-400">
        Plans cover the full research workload of a solo practice under fair professional
        use. A higher-volume plan for busy firms is on the way.
      </p>

      <h2 className="mt-14 text-xl [font-family:var(--font-serif)]">Questions attorneys ask us</h2>
      <div className="mt-4 space-y-5 text-sm">
        <div>
          <h3 className="font-semibold">Can I upgrade during the trial?</h3>
          <p className="mt-1 text-[#5d5848] dark:text-neutral-300">
            Yes — upgrading any time keeps your access uninterrupted, no waiting for the
            trial to end.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Is my research confidential?</h3>
          <p className="mt-1 text-[#5d5848] dark:text-neutral-300">
            Your questions are not used to train any model, and we do not keep a central log
            of questions — research history lives in your own browser. Documents you audit
            are processed in memory and not retained.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Where do answers come from?</h3>
          <p className="mt-1 text-[#5d5848] dark:text-neutral-300">
            Exclusively from a curated corpus of New York primary sources: the Consolidated
            Laws, ten years of court decisions, DHCR guidance, the Uniform Civil Rules, and
            official forms — each answer cites and links to them.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Is this legal advice?</h3>
          <p className="mt-1 text-[#5d5848] dark:text-neutral-300">
            No. Casewise is a research tool for licensed attorneys. Verify everything against
            the cited sources — the product is designed to make that verification fast.
          </p>
        </div>
      </div>
    </main>
  );
}
