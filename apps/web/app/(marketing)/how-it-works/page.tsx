import Link from "next/link";

const STEPS = [
  {
    n: "1",
    title: "Ask in plain English",
    body: "Type the question the way you would say it to a colleague: \"Can my client withhold rent for a heat outage?\" No Boolean syntax, no search operators. You can also set a research date to answer as of a past point in time.",
  },
  {
    n: "2",
    title: "Casewise retrieves the law",
    body: "The question runs against a closed library of New York primary sources: twelve bodies of statute, ten years of court decisions plus the landmark Court of Appeals cases, DHCR guidance, court rules, and official forms. It never searches the open internet.",
  },
  {
    n: "3",
    title: "The answer is drafted from those sources only",
    body: "Every assertion carries a citation to a retrieved document. The model cannot cite anything outside what was retrieved, so a fabricated case name is structurally impossible, not just unlikely.",
  },
  {
    n: "4",
    title: "Verification runs before you read it",
    body: "Citations are mapped back to the real documents and every quoted passage is compared word for word with the source text. Exact matches are marked verified; anything else is flagged for your review. Each source links to the official text, one click from answer to authority.",
  },
  {
    n: "5",
    title: "You verify and take it to work product",
    body: "Open the cited authorities, export a Word memo with a verification appendix, draft an IRAC analysis from your case facts, or run opposing counsel's brief through the citation checker. Casewise supports your judgment; it never replaces it.",
  },
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">
        How it works
      </h1>
      <p className="mt-2 text-[#6b6450] dark:text-neutral-400">
        From a plain-English question to verified, cited research in under a minute.
      </p>
      <ol className="mt-10 space-y-6">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="flex gap-4 rounded-2xl border border-[#e3e1d5] bg-white p-6 dark:border-neutral-700 dark:bg-[#30302e]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1e3a5a] font-semibold text-white">
              {s.n}
            </span>
            <div>
              <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href="/app"
          className="rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
        >
          Try 5 questions free
        </Link>
        <span className="text-xs text-[#a39f8d]">No sign-up required.</span>
      </div>
    </main>
  );
}
