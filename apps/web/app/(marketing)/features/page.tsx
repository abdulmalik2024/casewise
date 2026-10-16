const features = [
  {
    title: "Ask — cited answers, streamed live",
    body: "Plain-English questions answered from NY statutes, ten years of court decisions, DHCR guidance, court rules and official forms. Answers stream in as they're drafted, every assertion carries a citation, and follow-up questions keep the conversation's context.",
  },
  {
    title: "Verification you can see",
    body: "Citations are mapped server-side to retrieved documents — markers that don't correspond to a real source are stripped before you see them. Every quoted passage is string-matched against the source text and the result is shown under each answer.",
  },
  {
    title: "Check cites — audit any document",
    body: "Paste text or upload a PDF/Word brief. Statutes, NYCRR rules, and slip opinions verify against the corpus; reporter citations check against an offline catalog of 5.1 million published citations. Fabricated citations are flagged in red — it works on opposing counsel's filings too.",
  },
  {
    title: "Building-grounded answers",
    body: "Mention a NYC address and Casewise grounds the analysis in that building's public record: rent-stabilized unit indicators, open HPD violations by class, the registered owner, and marshal eviction history — cited as a source with a link to the underlying data.",
  },
  {
    title: "Research memos in Word",
    body: "One click exports an answer as a formatted .docx memo: Question Presented, Discussion, Table of Authorities, and a Verification Appendix recording the citation guarantee and quote-check results.",
  },
  {
    title: "Point-in-time research",
    body: "Set an as-of date and decisions or guidance that postdate it are excluded; statute sections amended after the date are flagged so reliance is caveated. Built for litigation over past events.",
  },
  {
    title: "Search the sources directly",
    body: "Semantic search across statutes, decisions, DHCR guidance, court rules and forms — filter by source type, with relevance grading and links to official texts.",
  },
  {
    title: "A corpus that maintains itself",
    body: "New decisions flow in daily from the Official Reports feeds. Statutes are versioned so superseded text is kept, never overwritten. Every source records where it came from and when.",
  },
];

export default function Features() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">Features</h1>
      <p className="mt-2 text-[#6b6450] dark:text-neutral-400">
        Built for one job: trustworthy New York property-law research for working attorneys.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-[#e3e1d5] bg-white p-6 dark:border-neutral-700 dark:bg-[#30302e]"
          >
            <h3 className="font-semibold [font-family:var(--font-serif)] text-lg">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
