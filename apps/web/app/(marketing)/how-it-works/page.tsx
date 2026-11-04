import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works: The Verification Pipeline",
  description:
    "What happens to an answer before you see it: retrieval from a closed library of NY primary law, drafting under constraint, citation mapping, and word-for-word quote checks.",
};

import Link from "next/link";
import Reveal from "../Reveal";

const STEPS = [
  {
    n: "01",
    label: "The question",
    title: "Ask in plain English",
    body: "Type the question the way you would say it to a colleague: \"Can my client withhold rent for a heat outage?\" No Boolean syntax, no search operators. You can also set a research date to answer as of a past point in time.",
  },
  {
    n: "02",
    label: "The library",
    title: "Retrieval runs against a closed library",
    body: "The question runs against New York primary sources only: twelve bodies of statute, ten years of court decisions plus the landmark Court of Appeals cases, DHCR guidance, court rules, and official forms. It never searches the open internet. What is not in the library cannot enter the answer.",
  },
  {
    n: "03",
    label: "The constraint",
    title: "The answer is drafted under constraint",
    body: "Every assertion must carry a citation to a document that was actually retrieved. The model cannot cite anything outside that set, so a fabricated case name is structurally impossible, not just unlikely.",
  },
  {
    n: "04",
    label: "The checks",
    title: "Verification runs before you read a word",
    body: "Every citation is mapped back to the real document. Every quoted passage is compared word for word with the source text. Exact matches are marked verified; anything else is flagged for your review, visibly, next to the answer. When a check cannot be completed, Casewise says so instead of papering over it.",
  },
  {
    n: "05",
    label: "Your judgment",
    title: "You verify, then take it to work product",
    body: "Each source links to the official text, one click from answer to authority. Export a Word memo with a verification appendix, draft an IRAC analysis from your case facts, or run opposing counsel's brief through the citation checker. Casewise supports your judgment; it never replaces it.",
  },
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <p className="cw-hero-in cw-d1 pt-10 text-[11px] font-medium uppercase tracking-[0.22em] text-[#a39f8d] dark:text-neutral-500">
        The verification pipeline
      </p>
      <h1 className="cw-hero-in cw-d2 mt-3 text-balance text-3xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-4xl">
        What happens to an answer{" "}
        <em className="text-[#1e3a5a] dark:text-[#a8c4e0]">before you see it.</em>
      </h1>
      <p className="cw-hero-in cw-d3 mt-4 max-w-2xl leading-relaxed text-[#6b6450] dark:text-neutral-400">
        In legal work, a hallucinated citation is not a rough edge, it is
        malpractice exposure. So verification is not a feature we added. It is
        the order in which the system is built: the checks run first, and the
        answer only exists if it survives them.
      </p>

      <ol className="mt-12">
        {STEPS.map((s, i) => (
          <li key={s.n} className="border-t border-[#e8e6dc] dark:border-neutral-800">
            <Reveal>
              <div className="grid gap-2 py-8 md:grid-cols-[7rem_1fr] md:gap-6">
                <div>
                  <div className="text-3xl font-semibold text-[#d8d5c5] [font-family:var(--font-serif)] dark:text-neutral-700">
                    {s.n}
                  </div>
                  <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#1e3a5a] dark:text-[#a8c4e0]">
                    {s.label}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]">
                    {s.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-[#5d5848] dark:text-neutral-300">
                    {s.body}
                  </p>
                  {i === 3 && (
                    <p className="mt-3 text-sm italic text-[#8a8571] [font-family:var(--font-serif)] dark:text-neutral-500">
                      This step makes Casewise a few seconds slower than a
                      chatbot. That is the trade, and it is the point.
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal>
        <div className="mt-6 rounded-2xl border border-[#e3e1d5] bg-[#f5f4ee] p-8 dark:border-neutral-700 dark:bg-[#1f1e1b]">
          <p className="text-balance text-xl leading-relaxed text-[#3d3929] [font-family:var(--font-serif)] dark:text-neutral-200">
            A citation does not reach you because the model sounded confident.
            It reaches you because it survived the checks.
          </p>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/app"
            className="cw-cta rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
          >
            Ask your first question <span className="cw-arrow">→</span>
          </Link>
          <span className="text-xs text-[#a39f8d]">
            No sign-up to try · 30 days free, no credit card
          </span>
        </div>
      </Reveal>
    </main>
  );
}
