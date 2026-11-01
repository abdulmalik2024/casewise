import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Casewise collects, what it deliberately does not store, and the choices you have. Research questions are not saved unless you explicitly save them to a matter.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "The short version",
    body: [
      "Casewise is built so that we hold as little of your information as possible. Research questions from signed-in users are processed in memory and are not stored on our servers. The one exception is explicit: if you save a Case Prep analysis to a matter, that matter is stored for you until you delete it. We collect what we need to run accounts, enforce the guest preview limit, and take payment, and nothing else. We do not sell or share personal information, and we do not run advertising trackers.",
    ],
  },
  {
    title: "What we collect",
    body: [
      "Account information. When you create an account we store your email address, your subscription plan, and the account creation date. Authentication is handled by Supabase. If you sign in with Google, we receive your name and email address from Google; we do not receive your password or your Google data.",
      "Guest preview usage. The free preview allows a limited number of questions without an account. To enforce that limit we store a random guest identifier and your IP address with a question count. We do not store the text of guest questions.",
      "Billing. Payments are processed by Stripe. Your card number never touches our servers; we store only your plan status and the identifiers Stripe needs to manage your subscription.",
      "Feedback. If you rate an answer or send us feedback, we store what you submitted.",
      "Saved matters. If you use Save to matter in Case Prep, the matter name, your inputs, and the generated analysis are stored, encrypted in transit and at rest, visible only to your account. You can delete any matter at any time, and deletion is immediate and permanent.",
      "Site analytics. We use Vercel Web Analytics, a cookieless, aggregate measurement tool. It tells us which pages are visited and from which country, and it cannot identify you or follow you across other sites.",
    ],
  },
  {
    title: "What we deliberately do not store",
    body: [
      "Research questions and answers for signed-in users are not written to our database. Your conversation exists in your browser during the session and is gone when you close it, unless you explicitly save a Case Prep analysis to a matter. We believe a legal research tool should not keep a record of what you are researching, and we have designed the system so that it cannot.",
    ],
  },
  {
    title: "How questions are processed",
    body: [
      "To generate an answer, your question and the retrieved source passages are sent to Anthropic, our AI model provider, over an encrypted connection. Under Anthropic's commercial API terms, API inputs and outputs are not used to train their models. Retrieval runs against our own closed library of New York primary law; your question is never sent to a web search engine.",
    ],
  },
  {
    title: "Cookies and local storage",
    body: [
      "We use browser storage for your login session and interface preferences. We do not use advertising cookies, third-party trackers, or social media pixels anywhere on the site.",
    ],
  },
  {
    title: "Who we share information with",
    body: [
      "Only the service providers needed to run Casewise: Supabase (authentication and database), Stripe (payments), Vercel and Railway (hosting), and Anthropic (answer generation, as described above). Each receives only what its role requires. We do not sell personal information, and we do not share it with advertisers or data brokers. We would disclose information in response to valid legal process, and if that ever happens we hold very little to disclose.",
    ],
  },
  {
    title: "Your choices and rights",
    body: [
      "You can delete saved matters yourself at any time. To access or delete your account data entirely, email hello@casewise.si from your account address and we will act on it promptly. We will only send you marketing email if you opt in, and every such email includes an unsubscribe link.",
    ],
  },
  {
    title: "Data security and location",
    body: [
      "All traffic is encrypted with TLS. Data at rest is encrypted by our hosting providers, whose infrastructure is located in the United States. Access to production systems is limited to the people who operate the service.",
    ],
  },
  {
    title: "Changes and contact",
    body: [
      "Casewise is not directed to anyone under 18. If we change this policy, the new version will be posted at this address with an updated date. Questions go to hello@casewise.si.",
    ],
  },
];

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">
        Privacy Policy
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
