export type Post = {
  slug: string;
  title: string;
  date: string; // ISO
  excerpt: string;
  body: string[]; // paragraphs
};

export const POSTS: Post[] = [
  {
    slug: "why-fabricated-citations-cant-reach-you",
    title: "Why a fabricated citation can't reach you in Casewise",
    date: "2026-10-20",
    excerpt:
      "Courts have sanctioned attorneys over AI-invented cases in every federal circuit that has faced the question. The fix isn't a disclaimer. It's architecture.",
    body: [
      "In 2023, two New York attorneys were sanctioned for filing a brief with six cases that did not exist; a chatbot had invented them, complete with convincing quotes and internal citations. By early 2026, appellate courts across the country had issued their own AI-hallucination sanctions, with six-figure penalties in a single quarter. Every legal AI vendor now promises verification. Most deliver a disclaimer.",
      "Casewise took a different route: make the failure structurally impossible rather than merely discouraged. When you ask a question, the system first retrieves real documents from a closed library of New York primary law: statutes, a decade of court decisions plus the landmark Court of Appeals cases, DHCR guidance, court rules, and official forms. The model drafting your answer is only permitted to cite those retrieved documents, by numbered marker. Any marker that does not correspond to a retrieved document is stripped by the server before the answer reaches you. There is no pathway, none, by which an invented case name can appear with a citation attached.",
      "Quotations get a second, independent check. Every quoted passage in an answer is compared word for word against the stored source text, by software, not by the model grading itself. Exact matches are marked verified. Anything else is flagged: \"not an exact match, check wording before citing.\" You see the check's result under every answer.",
      "Documents you run through the citation checker get the same treatment in reverse: every New York case citation in a brief, yours or opposing counsel's, is validated against 5.1 million official records going back to the 1800s. A citation that matches nothing is flagged as suspect in red.",
      "None of this replaces attorney judgment, and it is not meant to. The point is narrower and more useful: when you verify a Casewise answer, you are confirming sound authorities, not hunting for invented ones. The tool does the part software can guarantee, so your time goes to the part only a lawyer can do.",
    ],
  },
];
