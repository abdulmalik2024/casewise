import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verified Legal Research for NY Landlord-Tenant Attorneys",
  description:
    "AI legal research for New York landlord-tenant and real estate litigation attorneys. Cited, quoted, and verified against NY statutes, court decisions, and DHCR guidance. Try it free.",
};

import Link from "next/link";
import Reveal from "./Reveal";
import CountUp from "./CountUp";

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

function SectionMark({ n, label }: { n: string; label: string }) {
  return (
    <p className="text-center text-[11px] font-medium uppercase tracking-[0.22em] text-[#a39f8d] dark:text-neutral-500">
      <span className="text-[#1e3a5a] dark:text-[#a8c4e0]">§ {n}</span>
      <span className="mx-2 text-[#d8d5c5]">·</span>
      {label}
    </p>
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
    <main className="overflow-x-clip">
      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pt-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-24 -z-10 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[#1e3a5a] opacity-[0.05] blur-3xl dark:opacity-[0.12]"
        />
        <p className="cw-hero-in cw-d1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#a39f8d] dark:text-neutral-500">
          Legal research for New York attorneys
        </p>
        <h1 className="cw-hero-in cw-d2 mx-auto mt-4 max-w-4xl text-balance text-[2.6rem] leading-[1.12] tracking-tight [font-family:var(--font-serif)] md:text-6xl">
          AI legal research that assumes{" "}
          <em className="cw-underline text-[#1e3a5a] dark:text-[#a8c4e0]">
            the AI is wrong.
          </em>
        </h1>
        <p className="cw-hero-in cw-d3 mx-auto mt-6 max-w-2xl text-lg text-[#6b6450] dark:text-neutral-400">
          Chatbots invent cases. Courts sanction the attorneys who cite them.
          Casewise works on one rule: no citation and no quotation reaches you
          until it has been checked against the official New York source.
        </p>
        <div className="cw-hero-in cw-d4 mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/app"
            className="cw-cta rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
          >
            Ask your first question <span className="cw-arrow">→</span>
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-full px-7 py-3 font-medium text-[#5d5848] transition-colors hover:bg-[#efede3] dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            See the verification pipeline
          </Link>
        </div>
        <p className="cw-hero-in cw-d5 mt-4 text-xs text-[#a39f8d]">
          For licensed attorneys · No sign-up to try · 30 days free, no credit card
        </p>
        <p className="cw-hero-in cw-d5 mt-3 text-[13px] text-[#6b6450] dark:text-neutral-400">
          Built and tested with a practicing New York attorney.
        </p>

        <div className="cw-hero-in cw-d6 mx-auto mt-14 max-w-4xl">
          <div className="max-h-[560px] overflow-hidden rounded-2xl">
            <BrowserFrame
              src="/shots/ask-verified.png"
              alt="Casewise answering a warranty of habitability question with inline citations"
            />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto mt-16 max-w-5xl border-y border-[#e8e6dc] px-6 py-8 dark:border-neutral-800">
        <Reveal className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          {stats.map(([n, label]) => (
            <div key={label}>
              <CountUp
                value={n}
                className="text-2xl font-semibold tabular-nums [font-family:var(--font-serif)]"
              />
              <div className="mt-1 text-xs text-[#8a8571] dark:text-neutral-400">{label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-5xl px-6 pt-20">
        <Reveal>
          <SectionMark n="01" label="The problem" />
          <h2 className="mx-auto mt-3 max-w-3xl text-balance text-center text-3xl tracking-tight [font-family:var(--font-serif)] md:text-4xl">
            A fabricated citation is not a glitch.{" "}
            <em className="text-[#1e3a5a] dark:text-[#a8c4e0]">It is a sanction.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-center leading-relaxed text-[#5d5848] dark:text-neutral-300">
            Since Mata v. Avianca, courts have sanctioned attorneys again and
            again for filing AI-invented authority. The general chatbots draft
            beautifully and cite confidently, and they make cases up. The
            problem is not that attorneys stopped checking. It is that the
            tools were never built to be checked.
          </p>
        </Reveal>
      </section>

      {/* Differentiation: what we built instead */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <h3 className="mx-auto max-w-2xl text-center text-xl tracking-tight text-[#6b6450] [font-family:var(--font-serif)] dark:text-neutral-400">
            So we built the opposite, five choices at a time.
          </h3>
        </Reveal>
        <Reveal delay={100}>
          <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border border-[#e3e1d5] text-sm dark:border-neutral-700">
            {[
              [
                "Searches the internet and hopes",
                "A closed library of NY primary law. The model cannot cite a document that wasn't retrieved, so a fabricated citation is structurally impossible.",
              ],
              [
                "A verification disclaimer",
                "Verification you can watch: every quotation compared word for word with the source text, every citation checked against 5.1M official records back to the 1800s.",
              ],
              [
                "Fifty states, an inch deep",
                "One jurisdiction, all the way down: DHCR bulletins and fact sheets, Housing Part decisions, ETPA, the Rent Stabilization universe no national tool stocks.",
              ],
              [
                "Knows the law, not your building",
                "Mention a NYC address and the answer is grounded in that building's record: stabilization indicators, HPD violations, ownership, eviction history.",
              ],
              [
                "Stores your research as a feature",
                "Stores nothing. Questions never touch our servers' storage, history lives in your browser, and documents you check are processed in memory. What we don't hold can't leak or be subpoenaed.",
              ],
            ].map(([them, us], i) => (
              <div
                key={i}
                className={`grid gap-2 p-5 md:grid-cols-[1fr_1.4fr] md:gap-6 ${
                  i % 2 ? "bg-[#f5f4ee] dark:bg-[#1f1e1b]" : "bg-white dark:bg-[#30302e]"
                }`}
              >
                <div className="text-[#a39f8d] line-through decoration-[#d8d5c5] dark:text-neutral-500">
                  {them}
                </div>
                <div className="text-[#3d3929] dark:text-neutral-200">{us}</div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={150}>
          <p className="mx-auto mt-8 max-w-2xl text-center text-[15px] italic leading-relaxed text-[#6b6450] [font-family:var(--font-serif)] dark:text-neutral-400">
            This makes Casewise a few seconds slower than a chatbot. That is
            the trade, and it is the point.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <div className="mt-6 text-center">
            <Link
              href="/how-it-works"
              className="text-sm font-medium text-[#1e3a5a] underline decoration-[#c9d4e0] underline-offset-4 transition-colors hover:decoration-[#1e3a5a] dark:text-[#a8c4e0]"
            >
              The full verification pipeline, step by step →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Testimonial */}
      <section className="mx-auto max-w-3xl px-6 pb-4 text-center">
        <Reveal>
          <blockquote className="text-balance text-xl leading-relaxed text-[#3d3929] [font-family:var(--font-serif)] dark:text-neutral-200">
            &ldquo;I like the certainty and direct linking to sources. I like the direct
            quoting word for word.&rdquo;
          </blockquote>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#a39f8d]">
            Law student, New York
          </p>
        </Reveal>
      </section>

      {/* Showcases */}
      <div className="mx-auto max-w-5xl px-6 pt-10">
        <Reveal>
          <SectionMark n="02" label="The product" />
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center text-3xl tracking-tight [font-family:var(--font-serif)] md:text-4xl">
            Watch the checks run.{" "}
            <em className="text-[#1e3a5a] dark:text-[#a8c4e0]">On real screens.</em>
          </h2>
        </Reveal>
      </div>
      {showcases.map((s, i) => (
        <section key={s.eyebrow} className="mx-auto max-w-5xl px-6 py-14">
          <div
            className={`flex flex-col gap-10 md:items-center ${
              i % 2 ? "md:flex-row-reverse" : "md:flex-row"
            }`}
          >
            <Reveal className="md:w-2/5">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#1e3a5a] dark:text-[#a8c4e0]">
                {s.eyebrow}
              </div>
              <h2 className="mt-2 text-3xl leading-snug tracking-tight [font-family:var(--font-serif)]">
                {s.title}
              </h2>
              <p className="mt-4 leading-relaxed text-[#5d5848] dark:text-neutral-300">
                {s.body}
              </p>
            </Reveal>
            <Reveal delay={120} className="md:w-3/5">
              <div className="max-h-[520px] overflow-hidden rounded-2xl">
                <BrowserFrame src={s.img} alt={s.alt} />
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      {/* Use cases */}
      <section className="border-y border-[#e8e6dc] bg-[#f5f4ee] py-20 dark:border-neutral-800 dark:bg-[#1f1e1b]">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <SectionMark n="03" label="The work" />
            <h2 className="mt-3 text-center text-3xl tracking-tight [font-family:var(--font-serif)]">
              Built for the work on your desk.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {useCases.map((u, i) => (
              <Reveal key={u.title} delay={i * 100}>
                <div className="h-full rounded-2xl border border-[#e3e1d5] bg-white p-6 transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(61,57,41,0.1)] dark:border-neutral-700 dark:bg-[#30302e]">
                  <h3 className="font-semibold [font-family:var(--font-serif)] text-lg">
                    {u.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
                    {u.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <SectionMark n="04" label="Confidentiality" />
          <h2 className="mt-3 text-center text-3xl tracking-tight [font-family:var(--font-serif)]">
            Designed for attorney confidentiality.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            [
              "Your questions stay yours",
              "Nothing you ask trains any model. We keep no central log of questions; research history lives in your own browser. No ad trackers, no cookie banners, nothing to opt out of.",
            ],
            [
              "Verification by construction",
              "The drafting model can only cite sources retrieved for your question. Citations are mapped to real documents server-side; a fabricated cite cannot reach you. Quotes are matched character-for-character.",
            ],
            [
              "Primary sources, always",
              "Every citation links to the official text: nysenate.gov, nycourts.gov, hcr.ny.gov. One click from answer to authority. Verify everything; the product is built to make that fast.",
            ],
          ].map(([title, body], i) => (
            <Reveal key={title} delay={i * 100}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
                {body}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[#e8e6dc] py-20 text-center dark:border-neutral-800">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-balance px-6 text-4xl leading-snug tracking-tight [font-family:var(--font-serif)]">
            A question on your desk{" "}
            <em className="text-[#1e3a5a] dark:text-[#a8c4e0]">right now?</em>
          </h2>
          <p className="mx-auto mt-4 max-w-xl px-6 text-[#6b6450] dark:text-neutral-400">
            Ask it. No sign-up, cited answer in under a minute, every quote
            checked before you see it.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-8">
            <Link
              href="/app"
              className="cw-cta rounded-full bg-[#1e3a5a] px-8 py-3.5 font-medium text-white hover:bg-[#16304b]"
            >
              Try Casewise free <span className="cw-arrow">→</span>
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#a39f8d]">
            30 days free · no credit card · for licensed attorneys
          </p>
          <p className="mx-auto mt-6 max-w-xl px-6 text-xs leading-relaxed text-[#8a8571] dark:text-neutral-500">
            Confidential by design: no question logging, nothing trains any
            model, research history stays in your browser.
          </p>
        </Reveal>
      </section>
    </main>
  );
}
