import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Who It's For",
  description:
    "Built for New York landlord-tenant attorneys, eviction defense counsel, Housing Court practitioners, real estate litigators, property rights attorneys, and the paralegals and law students who work with them.",
};

import Link from "next/link";

const AUDIENCES = [
  {
    id: "landlord-tenant",
    title: "Landlord-tenant attorneys",
    body: "The core of the library: the RPL, RPAPL, Multiple Dwelling Law and ETPA in full, ten years of Appellate Term and Court of Appeals housing decisions, DHCR fact sheets and operational bulletins, and NYC building records. Notice requirements, holdovers, nonpayment, rent stabilization, habitability: asked and answered with the controlling section quoted.",
  },
  {
    id: "eviction-defense",
    title: "Eviction defense and tenant attorneys",
    body: "The same foundation from the defense side: warranty-of-habitability case law, rent-overcharge authorities including the landmark fraud cases, retaliation and lockout statutes, and building records that put HPD violations and ownership history behind your defenses.",
  },
  {
    id: "housing-court",
    title: "Housing Court practitioners",
    body: "Between calendar calls there is no time for a research session. Ask from your phone, get the short cited answer first, and go deeper only when you need to. The Housing Part rules and official landlord-tenant forms are in the library alongside the case law.",
  },
  {
    id: "re-litigation",
    title: "Real estate litigators",
    body: "The full CPLR, RPAPL, General Obligations Law, UCC, Banking Law and Lien Law, with a decade of decisions. Check every citation in your brief, or opposing counsel's, against 5.1 million official records going back to the 1800s, and export research memos with a verification appendix.",
  },
  {
    id: "property-rights",
    title: "Property rights attorneys",
    body: "Quiet title, adverse possession, easements and boundary disputes: the RPAPL articles and supporting decisions, searchable in plain English with exact-phrase matching when the precise statutory language is the argument.",
  },
  {
    id: "paralegals-students",
    title: "Paralegals and law students",
    body: "First-pass research and cite checking under attorney supervision, and a clean way to learn how New York housing law actually fits together: every answer shows its authorities, so the research trail is the lesson. Student-friendly Starter pricing.",
  },
];

export default function WhoItsFor() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">
        Who it&apos;s for
      </h1>
      <p className="mt-2 text-[#6b6450] dark:text-neutral-400">
        Built for licensed attorneys and the people who work with them, in New York
        landlord-tenant and real estate litigation practice.
      </p>
      <div className="mt-10 space-y-6">
        {AUDIENCES.map((a) => (
          <section
            key={a.id}
            id={a.id}
            className="scroll-mt-24 rounded-2xl border border-[#e3e1d5] bg-white p-6 dark:border-neutral-700 dark:bg-[#30302e]"
          >
            <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">{a.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              {a.body}
            </p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-[#8a8571] dark:text-neutral-400">
        Casewise is for legal professionals. It is a research tool, not legal advice, and
        it is not offered to the public for self-representation.
      </p>
      <div className="mt-6">
        <Link
          href="/app"
          className="rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
        >
          Try 5 questions free
        </Link>
      </div>
    </main>
  );
}
