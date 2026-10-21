import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verified Legal Research for NY Landlord-Tenant Attorneys",
  description:
    "AI legal research for New York landlord-tenant and real estate litigation attorneys. Cited, quoted, and verified against NY statutes, court decisions, and DHCR guidance. Try 5 questions free.",
};

import Link from "next/link";

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e3e1d5] bg-white shadow-[0_8px_40px_rgba(61,57,41,0.12)] dark:border-neutral-700 dark:bg-[#30302e]">
      <div className="flex items-center gap-2 border-b border-[#efede3] bg-[#faf9f5] px-4 py-2.5 dark:border-neutral-800 dark:bg-[#262624]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e8b4ab]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e8d5ab]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#b4cdb2]" />
        <span className="ml-3 rounded-md bg-white px-3 py-0.5 text-xs text-[#a39f8d] dark:bg-neutral-800 dark:text-neutral-500">
          casewise.si/app
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full" loading="lazy" />
    </div>
  );
}

const showcases = [
  {
    eyebrow: "Ask",
    title: "Answers an attorney can stand behind.",
    body: "Ask in plain English. Casewise retrieves the controlling New York authorities (statutes, ten years of decisions, DHCR guidance, court rules) and drafts a structured answer where every assertion carries a citation. Quoted language is string-matched to the source, word for word, and the check is shown with the answer.",
    img: "/shots/ask-verified.png",
    alt: "Casewise answering a warranty of habitability question with inline citations",
  },
  {
    eyebrow: "Check cites",
    title: "Audit any filing in seconds, including theirs.",
    body: "Paste a brief or upload a PDF or Word file. Every citation is verified: statutes and rules against the corpus, case law against a catalog of 5.1 million published citations. Real authority comes back with its case name and year. Fabricated authority comes back in red.",
    img: "/shots/check-cites.png",
    alt: "Citation audit flagging a fabricated citation as NOT FOUND",
  },
  {
    eyebrow: "Building records",
    title: "Analysis grounded in the actual building.",
    body: "Mention a NYC address and the answer reflects that building's public record (rent-stabilization indicators, open HPD violations by class, the registered owner, eviction history), cited like any other source, linked to the underlying data.",
    img: "/shots/building-sources.png",
    alt: "Verified sources including a live building record for a Bronx address",
  },
];

const useCases = [
  {
    title: "Holdover & nonpayment defense",
    body: "Notice periods, rent demands, service windows, and the housing-part rules, with the controlling section quoted, not paraphrased.",
  },
  {
    title: "Rent-stabilization questions",
    body: "Guideline increases, IAI and MCI rules, Good Cause coverage, deregulation history, grounded in DHCR's own bulletins and fact sheets.",
  },
  {
    title: "Habitability claims",
    body: "The warranty's elements, the building's actual violation record, and a decade of Appellate Term outcomes on both sides of the ledger.",
  },
];

const stats = [
  ["2,062", "NY statute sections, versioned"],
  ["11,500+", "court decisions, 10-year depth"],
  ["5.1M", "citations verified offline"],
  ["229K", "NYC buildings on record"],
];

export default function Landing() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-16 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#a39f8d] dark:text-neutral-500">
          Legal research for New York attorneys
        </p>
        <h1 className="mx-auto mt-4 max-w-4xl text-balance text-[2.6rem] leading-[1.12] tracking-tight [font-family:var(--font-serif)] md:text-6xl">
          Verified legal research for New York landlord-tenant and{" "}
          <span className="text-[#1e3a5a]">real estate litigation attorneys.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#6b6450] dark:text-neutral-400">
          Ask in plain English. Get answers grounded in New York statutes, court
          decisions, and DHCR guidance, with citations and quotations checked against
          the source.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/app"
            className="rounded-full bg-[#3d3929] px-7 py-3 font-medium text-[#faf9f5] transition-colors hover:bg-[#2a271c] dark:bg-neutral-100 dark:text-neutral-900"
          >
            Try 5 questions free
          </Link>
          <Link
            href="/features"
            className="rounded-full px-7 py-3 font-medium text-[#5d5848] hover:bg-[#efede3] dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            See how it works →
          </Link>
        </div>
        <p className="mt-4 text-xs text-[#a39f8d]">
          For licensed attorneys · No sign-up required · 7-day trial, no credit card
        </p>

        <div className="mx-auto mt-14 max-w-4xl">
          <div className="max-h-[560px] overflow-hidden rounded-2xl">
            <BrowserFrame
              src="/shots/ask-verified.png"
              alt="Casewise answering a warranty of habitability question with inline citations"
            />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-4 border-y border-[#e8e6dc] px-6 py-8 text-center md:grid-cols-4 dark:border-neutral-800">
        {stats.map(([n, label]) => (
          <div key={label}>
            <div className="text-2xl font-semibold [font-family:var(--font-serif)]">{n}</div>
            <div className="mt-1 text-xs text-[#8a8571] dark:text-neutral-400">{label}</div>
          </div>
        ))}
      </section>

      {/* Showcases */}
      {showcases.map((s, i) => (
        <section key={s.eyebrow} className="mx-auto max-w-5xl px-6 py-20">
          <div
            className={`flex flex-col gap-10 md:items-center ${
              i % 2 ? "md:flex-row-reverse" : "md:flex-row"
            }`}
          >
            <div className="md:w-2/5">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#1e3a5a]">
                {s.eyebrow}
              </div>
              <h2 className="mt-2 text-3xl leading-snug tracking-tight [font-family:var(--font-serif)]">
                {s.title}
              </h2>
              <p className="mt-4 leading-relaxed text-[#5d5848] dark:text-neutral-300">
                {s.body}
              </p>
            </div>
            <div className="md:w-3/5">
              <div className="max-h-[520px] overflow-hidden rounded-2xl">
                <BrowserFrame src={s.img} alt={s.alt} />
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Use cases */}
      <section className="border-y border-[#e8e6dc] bg-[#f5f4ee] py-20 dark:border-neutral-800 dark:bg-[#1f1e1b]">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl tracking-tight [font-family:var(--font-serif)]">
            Built for the work on your desk.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {useCases.map((u) => (
              <div
                key={u.title}
                className="rounded-2xl border border-[#e3e1d5] bg-white p-6 dark:border-neutral-700 dark:bg-[#30302e]"
              >
                <h3 className="font-semibold [font-family:var(--font-serif)] text-lg">
                  {u.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
                  {u.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl tracking-tight [font-family:var(--font-serif)]">
          Designed for attorney confidentiality.
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="font-semibold">Your questions stay yours</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              Nothing you ask trains any model. We keep no central log of questions;
              research history lives in your own browser. No ad trackers, no cookie
              banners, nothing to opt out of.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Verification by construction</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              The drafting model can only cite sources retrieved for your question.
              Citations are mapped to real documents server-side; a fabricated cite
              cannot reach you. Quotes are matched character-for-character.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Primary sources, always</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              Every citation links to the official text: nysenate.gov, nycourts.gov,
              hcr.ny.gov. One click from answer to authority. Verify everything; the
              product is built to make that fast.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[#e8e6dc] py-20 text-center dark:border-neutral-800">
        <h2 className="mx-auto max-w-2xl text-balance px-6 text-4xl leading-snug tracking-tight [font-family:var(--font-serif)]">
          Try Casewise on a real question from your practice.
        </h2>
        <div className="mt-8">
          <Link
            href="/signup"
            className="rounded-full bg-[#1e3a5a] px-8 py-3.5 font-medium text-white transition-colors hover:bg-[#16304b]"
          >
            Start researching, free
          </Link>
        </div>
        <p className="mt-4 text-xs text-[#a39f8d]">
          7-day trial · no credit card · for licensed attorneys
        </p>
      </section>
    </main>
  );
}
