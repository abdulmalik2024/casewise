import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern use of Casewise: a legal research tool for professionals, not legal advice, with verification required before reliance.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What Casewise is, and is not",
    body: [
      "Casewise is a legal research tool covering New York property law, built for licensed attorneys, legal professionals, and law students. It retrieves and cites primary sources and generates research analysis from them.",
      "Casewise is not a law firm and does not provide legal advice. Using it does not create an attorney-client relationship. Its output is research assistance for a trained reader, and every answer must be independently verified against the cited sources before anyone relies on it. If you are not a legal professional, Casewise is not a substitute for consulting one.",
    ],
  },
  {
    title: "Accounts and acceptable use",
    body: [
      "You are responsible for your account and for keeping your credentials secure. You agree not to misrepresent who you are when signing up, share one account across multiple people, scrape or bulk-download the service or its library, probe or disrupt the infrastructure, resell access, or use the service to break the law or the rules of professional conduct that apply to you.",
      "Plans are subject to fair use. Limits exist to keep the service fast and affordable for everyone; accounts with usage patterns far outside normal professional research may be contacted or rate-limited.",
    ],
  },
  {
    title: "Trials, billing, and cancellation",
    body: [
      "New accounts receive a free trial with no payment method required. Paid subscriptions are billed through Stripe, monthly or yearly, and renew automatically until canceled. You can cancel at any time; cancellation takes effect at the end of the paid period already underway, and we do not charge again after that. Prices are shown on the pricing page and may change with notice before your next renewal.",
    ],
  },
  {
    title: "Your content and our content",
    body: [
      "You retain all rights to what you type into Casewise and to the facts of your matters. We claim no ownership of your research or your saved matters. The service itself, including its software, design, and the organization of its research library, belongs to Casewise. The underlying statutes, decisions, and other primary law are public documents and belong to no one.",
    ],
  },
  {
    title: "Disclaimers",
    body: [
      "The service is provided as is, without warranties of any kind, express or implied, including fitness for a particular purpose. The law changes, sources can be incomplete, and generated analysis can be wrong even when every citation is verified. Casewise does not warrant that its output is accurate, complete, or current, which is why verification against the cited sources is a condition of sensible use, not a formality.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the maximum extent permitted by law, Casewise and the people who build it are not liable for indirect, incidental, special, or consequential damages, or for any loss arising from reliance on generated output, and our total liability for any claim is limited to the amount you paid us in the twelve months before the claim arose.",
    ],
  },
  {
    title: "Termination, changes, and contact",
    body: [
      "You may stop using the service and delete your account at any time. We may suspend or terminate accounts that violate these terms. We may update these terms, and when we do the new version will be posted at this address with an updated date; continued use after a change is acceptance of it. These terms are governed by the laws of the State of New York. Questions go to hello@casewise.si.",
    ],
  },
];

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-[#a39f8d] dark:text-neutral-500">
        Effective November 1, 2026
      </p>
      {SECTIONS.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-xl font-semibold [font-family:var(--font-serif)]">{s.title}</h2>
          {s.body.map((p, i) => (
            <p
              key={i}
              className="mt-3 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300"
            >
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
