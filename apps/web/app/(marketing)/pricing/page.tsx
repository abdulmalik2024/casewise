import Link from "next/link";

export default function Pricing() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">Pricing</h1>
      <p className="mt-2 text-[#6b6450] dark:text-neutral-400">
        Simple, self-serve, no sales calls. Built for solo and small-firm practice.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
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
            href="/app"
            className="mt-6 block rounded-xl bg-[#c96442] px-5 py-2.5 text-center font-medium text-white hover:bg-[#b55a3a]"
          >
            Start free
          </Link>
        </div>

        <div className="rounded-2xl border-2 border-[#c96442] bg-white p-8 dark:bg-[#30302e]">
          <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">
            Professional
            <span className="ml-2 rounded-full bg-[#efede3] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
              early-adopter pricing
            </span>
          </h3>
          <div className="mt-2 text-3xl font-semibold [font-family:var(--font-serif)]">
            $99 <span className="text-sm font-normal text-[#8a8571]">per attorney / month</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-[#5d5848] dark:text-neutral-300">
            <li>✓ Unlimited research questions and searches</li>
            <li>✓ Check cites document audits</li>
            <li>✓ Word memo exports with verification appendix</li>
            <li>✓ Building records and point-in-time research</li>
            <li>✓ Priority support and feature input</li>
          </ul>
          <p className="mt-6 rounded-lg bg-[#f5f4ee] px-4 py-2.5 text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
            Available when your trial ends — early adopters lock this rate.
          </p>
        </div>
      </div>

      <h2 className="mt-14 text-xl [font-family:var(--font-serif)]">Questions attorneys ask us</h2>
      <div className="mt-4 space-y-5 text-sm">
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
