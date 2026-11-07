import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Citation Challenge",
  description:
    "A fabricated citation cannot reach you: Casewise checks every citation and quote against the official source before you see a word. If one ever gets through, 6 months free.",
};

import Link from "next/link";
import Reveal from "../Reveal";

const STEPS = [
  {
    n: "01",
    title: "Answers cite into a closed library",
    body: "Casewise retrieves from New York primary sources only, and the model may cite only the documents actually retrieved for your question. A citation is a reference into that set, never free text, so an invented case name has nothing to attach to.",
  },
  {
    n: "02",
    title: "Every citation and quote is checked",
    body: "Before you see the answer, each citation is mapped back to its real source document, and each quoted passage is compared word for word against the official text. Exact matches are marked verified.",
  },
  {
    n: "03",
    title: "Anything else is flagged, visibly",
    body: "A citation or quote that fails a check is flagged next to the answer for your review, never repaired silently. When a check cannot be completed, Casewise says so.",
  },
];

const TERMS = [
  "The challenge covers citations and quoted passages that Casewise marks verified. Items flagged for review are the system working as designed, not a win.",
  "To win: show a verified citation whose authority does not exist, or a verified quote that differs from the official text of the cited source.",
  "We check every report against the official source (nysenate.gov, nycourts.gov, and the other official publishers in our library) and document the outcome either way.",
  "The first verified report of a distinct issue earns the reward: 6 months of Casewise free. One reward per distinct issue.",
  "Open to anyone, including guest questions. No deadline: the offer stands for as long as Casewise runs.",
];

export default function Challenge() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <p className="cw-hero-in cw-d1 pt-10 text-[11px] font-medium uppercase tracking-[0.22em] text-[#a39f8d] dark:text-neutral-500">
        The citation challenge
      </p>
      <h1 className="cw-hero-in cw-d2 mt-3 text-balance text-3xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-4xl">
        A made-up citation cannot reach you.{" "}
        <em className="text-[#1e3a5a] dark:text-[#a8c4e0]">
          If one ever does, 6 months free.
        </em>
      </h1>
      <p className="cw-hero-in cw-d3 mt-4 max-w-2xl leading-relaxed text-[#6b6450] dark:text-neutral-400">
        Chatbots have invented cases, and courts have sanctioned the attorneys
        who cited them. Casewise is built so that cannot happen here: every
        citation marked verified points to a real authority, and every quote
        marked verified matches the official text word for word, checked
        before you read a single line. We are sure enough of that to put a
        standing offer behind it, and we expect to never pay it.
      </p>
      <div className="cw-hero-in cw-d4 mt-7 flex flex-wrap items-center gap-3">
        <Link
          href="/app"
          className="cw-cta cw-sheen rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
        >
          Start hunting <span className="cw-arrow">→</span>
        </Link>
        <span className="text-xs text-[#a39f8d]">
          No sign-up to try · Ask about the law you know best
        </span>
      </div>

      <Reveal>
        <h2 className="mt-16 text-2xl font-semibold tracking-tight [font-family:var(--font-serif)]">
          Why we can afford this bet
        </h2>
        <p className="mt-3 leading-relaxed text-[#5d5848] dark:text-neutral-300">
          This is not a bug hunt, and we are not asking for your help testing.
          The checks already ran before you read a word. The offer is not
          confidence in a model&apos;s memory, it is architecture. The full
          pipeline is on{" "}
          <Link
            href="/how-it-works"
            className="text-[#1e3a5a] underline decoration-[#1e3a5a]/30 underline-offset-2 hover:decoration-[#1e3a5a] dark:text-[#a8c4e0]"
          >
            how it works
          </Link>
          ; the short version:
        </p>
      </Reveal>

      <ol className="mt-6">
        {STEPS.map((s) => (
          <li key={s.n} className="border-t border-[#e8e6dc] dark:border-neutral-800">
            <Reveal>
              <div className="grid gap-2 py-6 md:grid-cols-[4rem_1fr] md:gap-6">
                <div className="text-2xl font-semibold text-[#d8d5c5] [font-family:var(--font-serif)] dark:text-neutral-700">
                  {s.n}
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight [font-family:var(--font-serif)]">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 leading-relaxed text-[#5d5848] dark:text-neutral-300">
                    {s.body}
                  </p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal>
        <h2 className="mt-14 text-2xl font-semibold tracking-tight [font-family:var(--font-serif)]">
          The terms, plainly
        </h2>
        <ul className="mt-5 space-y-3">
          {TERMS.map((t, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-xl border border-[#e3e1d5] bg-white px-4 py-3 text-sm leading-relaxed text-[#5d5848] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300"
            >
              <span className="font-semibold text-[#1e3a5a] dark:text-[#a8c4e0]">
                {i + 1}.
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal>
        <h2 className="mt-14 text-2xl font-semibold tracking-tight [font-family:var(--font-serif)]">
          What this challenge does not claim
        </h2>
        <p className="mt-3 leading-relaxed text-[#5d5848] dark:text-neutral-300">
          Verification guarantees that citations are real and quotes are exact.
          It does not guarantee that an analysis weighs authorities the way you
          would, or that the library contains every document relevant to your
          matter. That part is your judgment, and Casewise is built to support
          it, not replace it: every source links to the official text, one
          click from answer to authority. Casewise is a research tool for
          licensed attorneys and does not provide legal advice.
        </p>
      </Reveal>

      <Reveal>
        <div className="mt-12 rounded-2xl border border-[#e3e1d5] bg-[#f5f4ee] p-8 dark:border-neutral-700 dark:bg-[#1f1e1b]">
          <h2 className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]">
            Think you beat it?
          </h2>
          <p className="mt-2 leading-relaxed text-[#5d5848] dark:text-neutral-300">
            Email{" "}
            <a
              href="mailto:info@casewise.si?subject=Citation%20challenge%20report"
              className="text-[#1e3a5a] underline decoration-[#1e3a5a]/30 underline-offset-2 hover:decoration-[#1e3a5a] dark:text-[#a8c4e0]"
            >
              info@casewise.si
            </a>{" "}
            with your question, the answer you received, and the citation or
            quote you believe is wrong. We will check it against the official
            source and reply with what we find, either way. We expect this
            inbox to stay quiet.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="cw-cta cw-sheen rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
            >
              Ask a question you know the answer to{" "}
              <span className="cw-arrow">→</span>
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#a39f8d] dark:text-neutral-500">
            For licensed attorneys · No sign-up to try · 30 days free, no
            credit card
          </p>
        </div>
      </Reveal>
    </main>
  );
}
