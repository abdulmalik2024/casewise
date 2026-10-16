export default function About() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">About Casewise</h1>

      <div className="mt-6 space-y-5 leading-relaxed text-[#5d5848] dark:text-neutral-300">
        <p>
          Casewise is a legal research assistant built for solo and small-firm attorneys
          practicing New York property law. It was conceived by a practicing New York
          property-law attorney who saw the gap firsthand: the premium AI research platforms
          are priced for BigLaw, and the affordable ones know nothing about New York.
        </p>
        <p>
          We chose the opposite of the generic approach — one state, one practice area, done
          deeply. Casewise works from the primary sources themselves: every section of the
          Real Property Law, RPAPL, CPLR and related statutes (versioned, so history is
          never overwritten), ten years of New York appellate decisions, DHCR&apos;s bulletins
          and fact sheets, the Uniform Civil Rules, and the official landlord-tenant forms.
        </p>
        <p>
          The defining design decision is verification by construction. The model drafting an
          answer can only cite the sources retrieved for that question — citations are mapped
          to real documents on the server, quoted passages are string-matched against the
          source text, and documents you audit are checked against a catalog of 5.1 million
          published citations. Where the famous AI failure is the invented case, Casewise is
          architected so that failure cannot reach you.
        </p>
        <p>
          We are early, and we build in close conversation with the attorneys who use the
          product. If something is wrong or missing, the thumbs-down button genuinely reaches
          us — every piece of feedback shapes what gets built next.
        </p>
        <p className="text-sm text-[#8a8571] dark:text-neutral-400">
          Casewise is a research tool for licensed attorneys and does not provide legal
          advice. Reach us at hello@casewise.si.
        </p>
      </div>
    </main>
  );
}
