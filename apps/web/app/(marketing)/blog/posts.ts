export type Post = {
  slug: string;
  title: string;
  date: string; // ISO
  excerpt: string;
  keywords?: string[];
  body: string[]; // paragraphs; a "## " prefix renders as a subheading
};

export const POSTS: Post[] = [
  {
    slug: "ny-seller-disclosure-rpl-462-concealed-defects",
    title: "New York's Seller Disclosure Law (RPL § 462): The $500 Escape Hatch Is Gone",
    date: "2026-10-27",
    excerpt:
      "Since March 2024, sellers of 1-4 family homes must actually deliver the Property Condition Disclosure Statement, flood questions included. What buyer's counsel should check when damage looks concealed.",
    keywords: [
      "seller disclosure New York",
      "RPL 462 property condition disclosure",
      "concealed defects home purchase NY",
      "property condition disclosure statement",
      "flood disclosure New York",
    ],
    body: [
      "For two decades, New York's seller disclosure regime had a famous escape hatch: rather than complete the Property Condition Disclosure Statement required by Real Property Law § 462, a seller could simply credit the buyer $500 at closing and skip the questionnaire. Nearly every seller took the deal. A 2023 amendment ended that practice: for contracts signed on or after March 20, 2024, sellers of one-to-four family residential properties must actually deliver the completed statement, and the form now includes specific flood questions, including whether the property is in a FEMA flood zone and whether it has experienced flood damage.",
      "## What the statement covers",
      "The PCDS runs through the property's condition in the seller's actual knowledge: structural matters, water and rot damage, mechanical systems, environmental conditions, and now flood history and flood insurance claims. It is a disclosure of what the seller knows, not a warranty of condition, and it does not substitute for the buyer's own inspection.",
      "## Who is outside the statute",
      "The regime covers one-to-four family dwellings. Condominium and cooperative units are outside it, as are vacant land and most estate, foreclosure, and other fiduciary sales. For those transactions, the buyer's protections come from the contract, the inspection, and the common law.",
      "## Where the real fights happen: concealment",
      "New York remains a caveat emptor state for what the disclosure regime does not reach, but that doctrine has a hard edge: a seller may not actively conceal a defect. The recurring fact pattern is familiar to any real estate litigator: water damage behind fresh paint, a finished basement marketed as dry, a flood the neighbors remember but the listing forgot. Where the buyer can show affirmative steps to hide the condition, as-is clauses and merger clauses stop being the end of the analysis, and remedies from contract rescission to deposit recovery come into play.",
      "## What buyer's counsel should pin down early",
      "The questions that decide these disputes are concrete. When did the damage occur relative to contract signing? What does the delivered PCDS actually say, and is a flood answer false? What did the inspection report note, and was access to the affected area impeded? Were there prior insurance claims or permit applications that show knowledge? The timeline usually matters more than the adjectives.",
      "Casewise now carries the statutes and the appellate case law these disputes turn on: RPL § 462, the General Obligations Law, and Appellate Division decisions on concealment, deposit forfeiture, and specific performance. Its Case Prep workspace takes your facts and argues both sides with verified citations. Five free questions, no sign-up, at casewise.si.",
    ],
  },
  {
    slug: "ny-security-deposit-law-gol-7-108",
    title: "Security Deposits in New York (GOL § 7-108): The 14-Day Rule and What Landlords Can Deduct",
    date: "2026-10-27",
    excerpt:
      "One month's rent, a 14-day deadline with an itemized statement, and forfeiture for missing it. The security deposit rules practitioners cite daily, with the statute quoted rather than paraphrased.",
    keywords: [
      "security deposit law New York",
      "GOL 7-108",
      "14 day security deposit return NY",
      "security deposit deductions New York",
      "landlord keep security deposit",
    ],
    body: [
      "Since the 2019 Housing Stability and Tenant Protection Act rewrote General Obligations Law § 7-108, New York's residential security deposit rules have real teeth, and the deadlines are short enough that cases are often won or lost on the calendar alone.",
      "## The one-month cap",
      "For covered residential tenancies, the deposit or advance cannot exceed one month's rent. Demands for first month, last month, and a deposit together exceed the cap; the last-month demand is the usual offender.",
      "## The 14-day rule",
      "After the tenant vacates, the landlord has fourteen days to return the deposit. If anything is withheld, the landlord must provide an itemized statement of the basis within that same window. The consequence for missing it is the part practitioners quote: the landlord forfeits any right to retain any portion of the deposit. Courts have applied the forfeiture as written, which makes the mailing date of the itemized statement a dispositive fact worth establishing early in any deposit dispute.",
      "## What may be deducted",
      "The permissible bases are narrow: unpaid rent, damage beyond ordinary wear and tear, moving and storage of the tenant's belongings, and unpaid utility charges owed to the landlord. Ordinary wear is not damage; repainting after a multi-year tenancy and worn carpet in traffic paths belong to the landlord's cost of doing business, while broken fixtures and holes in walls do not.",
      "## The walk-through rights",
      "The statute also gives tenants process: on request, an inspection before move-out, with notice of what the landlord intends to claim and an opportunity to cure before vacating. Skipped process strengthens the tenant's hand in the ensuing dispute.",
      "## Willful violations",
      "A knowing violation of the deposit provisions can expose the landlord to punitive damages of up to twice the deposit. Between forfeiture and the punitive exposure, the economics of wrongly withholding a deposit have inverted since 2019.",
      "Ask Casewise about a deposit dispute and the answer quotes § 7-108's actual text, word-for-word verified against the statute, with the decisions applying it. It is one of our free sample questions: no sign-up needed, at casewise.si.",
    ],
  },
  {
    slug: "ny-warranty-of-habitability-rpl-235-b",
    title: "The Warranty of Habitability in New York (RPL § 235-b): Elements, Proof, and Rent Abatement",
    date: "2026-10-21",
    excerpt:
      "What RPL § 235-b actually covers, what a tenant must prove, how courts set abatements, and the defenses landlords raise. A working reference for NY housing practitioners.",
    keywords: [
      "warranty of habitability New York",
      "RPL 235-b",
      "rent abatement NY",
      "habitability defense nonpayment",
      "NYC housing court",
    ],
    body: [
      "Every residential lease in New York, written or oral, carries a warranty the parties cannot bargain away: the premises and common areas are fit for human habitation, fit for the uses reasonably intended by the parties, and free of conditions dangerous, hazardous or detrimental to life, health or safety. That is Real Property Law § 235-b, and the Court of Appeals gave it its working shape in Park West Management Corp. v. Mitchell, 47 N.Y.2d 316 (1979), upholding a rent abatement for a rent strike during a building-wide service breakdown.",
      "## What the tenant must prove",
      "The cases turn on specifics, not adjectives. Courts look for the dates the conditions existed, their severity and duration, notice to the landlord, and whether the landlord had access and an opportunity to cure. Photographs, 311 complaints, and HPD violation records corroborate testimony; expert proof is not required to establish damages. Conditions caused by the tenant's own conduct are not a breach.",
      "## How abatements are measured",
      "The classic measure is the difference between the rent reserved and the value of the premises in their defective condition, usually expressed as a percentage of rent over the affected period. Park West itself affirmed 10 percent; reported Housing Part decisions range widely with the severity of the conditions. For rent-regulated units, any DHCR rent reduction for the same conditions is deducted so there is no double recovery.",
      "## Where the warranty has limits",
      "It is a minimum standard, not a guarantee of luxury: the Court of Appeals in Solow v. Wellner, 86 N.Y.2d 582 (1995), held the warranty is not tied to the rent level or amenities of a high-end building. It does not apply to commercial leases. And minor or cosmetic conditions do not qualify.",
      "## The procedural posture that matters",
      "In practice the warranty lives as a defense and counterclaim in nonpayment proceedings, as the basis for an RPAPL § 755 stay where conditions are dangerous (rent is deposited with the court), and in rent-strike litigation. A tenant who withholds rent is betting the abatement will justify the arrears; a landlord moving against chronic nonpayment must contend with abatements the tenant previously won.",
      "This is the kind of question Casewise is built for: ask it in plain English and the answer comes back with § 235-b quoted word for word, the controlling Court of Appeals decisions cited, and every quotation verified against the source text before you see it. Try it with five free questions, no sign-up.",
    ],
  },
  {
    slug: "check-every-citation-before-filing",
    title: "How to Check Every Citation in a Brief Before Filing (Including Opposing Counsel's)",
    date: "2026-10-21",
    excerpt:
      "Courts in every federal circuit have sanctioned attorneys over AI-invented citations. A practical workflow for verifying cites in minutes, in your own papers and the other side's.",
    keywords: [
      "check legal citations",
      "verify case citations New York",
      "citation checker brief",
      "AI hallucinated cases sanctions",
      "cite checking before filing",
    ],
    body: [
      "Since Mata v. Avianca in 2023, sanctions for fabricated citations have spread from a single New York courtroom to appellate benches across the country, with six-figure penalty totals in a single quarter of 2026. The underlying failure is always the same: a plausible-looking case name, a real-looking reporter cite, and no one checked. The fix is unglamorous: check every citation, every time. The question is how to do it in minutes instead of hours.",
      "## What checking actually requires",
      "A citation can fail three different ways, and each needs its own check. The source may not exist at all (the fabrication problem). The source may exist but not say what the brief claims (the characterization problem). Or the quotation may be altered, sometimes subtly, from the original text (the misquote problem). Pulling each case on Westlaw covers the first two if you read carefully; almost nobody re-reads for the third.",
      "## A workflow that takes minutes",
      "Casewise's Check cites does the mechanical layers in one pass: paste the text of a brief, motion, or memo, or upload the PDF or Word file, and every New York citation is extracted and validated. Case citations are checked against 5.1 million official records going back to the 1800s; statute citations are checked across twelve bodies of NY law; quoted passages are compared word for word with the source text. Each citation comes back matched, not found, or quote mismatch, with a link to the source. What software cannot do, and should not pretend to, is the characterization judgment: whether the authority supports the proposition. That remains the lawyer's reading, now focused on real cases only.",
      "## Run it on the other side's papers",
      "The same check works on opposing counsel's filings, and that is where it gets interesting. A citation that matches nothing in the official records is either a typo or a problem, and either way it belongs in your opposition. In the AI era, checking the other side's citations is no longer paranoia; it is diligence courts have started to expect.",
      "## The document never leaves memory",
      "Briefs are work product. Casewise processes the document in memory for the duration of the check and does not save it; nothing you check is stored on our servers or used to train anything. That is a design decision, not a settings toggle.",
      "Check your next filing in two minutes at casewise.si: five free questions as a guest, and document checking on the 7-day free trial, no credit card.",
    ],
  },
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
