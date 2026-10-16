import Link from "next/link";

const stats = [
  ["2,062", "NY statute sections, versioned"],
  ["11,500+", "court decisions, 10-year depth"],
  ["5.1M", "citations verified offline"],
  ["229K", "NYC buildings on record"],
];

const pillars = [
  {
    title: "Citations that cannot be invented",
    body:
      "Casewise answers only from retrieved New York sources. Citations are mapped server-side to real documents — a fabricated cite is structurally impossible — and every quoted passage is string-matched against the source text.",
  },
  {
    title: "Check any document's cites",
    body:
      "Paste a brief or upload a PDF or Word file — yours or opposing counsel's. Every statute, rule, and case citation is verified against the corpus and a 5.1-million-citation catalog, with fabrications flagged in red.",
  },
  {
    title: "Answers grounded in the building",
    body:
      "Mention a NYC address and the analysis uses that building's actual record: rent-stabilization indicators, open HPD violations by class, registered owner, and eviction history.",
  },
];

export default function Landing() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-balance text-4xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-5xl">
          Find the law. Understand the precedent. Build your case.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-[#6b6450] dark:text-neutral-400">
          The research assistant built for New York property law. Plain-English questions,
          answers with verified citations to the statutes, decisions, and DHCR guidance
          themselves.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/app"
            className="rounded-xl bg-[#c96442] px-6 py-3 font-medium text-white transition-colors hover:bg-[#b55a3a]"
          >
            Start researching — free
          </Link>
          <Link
            href="/features"
            className="rounded-xl border border-[#e3e1d5] bg-white px-6 py-3 font-medium text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300"
          >
            See how it works
          </Link>
        </div>
        <p className="mt-4 text-xs text-[#a39f8d]">
          For licensed attorneys · 7-day free trial · no credit card required
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 border-y border-[#e8e6dc] py-8 text-center md:grid-cols-4 dark:border-neutral-800">
        {stats.map(([n, label]) => (
          <div key={label}>
            <div className="text-2xl font-semibold [font-family:var(--font-serif)]">{n}</div>
            <div className="mt-1 text-xs text-[#8a8571] dark:text-neutral-400">{label}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 py-16 md:grid-cols-3">
        {pillars.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-[#e3e1d5] bg-white p-6 dark:border-neutral-700 dark:bg-[#30302e]"
          >
            <h3 className="text-lg font-semibold [font-family:var(--font-serif)]">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              {p.body}
            </p>
          </div>
        ))}
      </section>

      <section className="pb-20 text-center">
        <h2 className="text-2xl tracking-tight [font-family:var(--font-serif)]">
          You know the stories about AI inventing cases.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-[#6b6450] dark:text-neutral-400">
          Casewise is built the opposite way: it retrieves real New York authorities first,
          writes only from them, and shows you the verification. Every citation links to the
          official text, one click away.
        </p>
      </section>
    </main>
  );
}
