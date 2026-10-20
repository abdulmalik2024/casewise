import Link from "next/link";

const FEATURE_LINKS = [
  ["Ask: cited answers", "/features#ask"],
  ["Verification you can see", "/features#verification"],
  ["Check cites: audit any document", "/features#check-cites"],
  ["Draft IRAC analyses", "/features#draft-irac"],
  ["Building-grounded answers", "/features#buildings"],
  ["Research memos in Word", "/features#memos"],
  ["Point-in-time research", "/features#point-in-time"],
  ["Search the sources directly", "/features#search"],
] as const;

const AUDIENCE_LINKS = [
  ["Landlord-tenant attorneys", "/who-its-for#landlord-tenant"],
  ["Eviction defense attorneys", "/who-its-for#eviction-defense"],
  ["Housing Court practitioners", "/who-its-for#housing-court"],
  ["Real estate litigators", "/who-its-for#re-litigation"],
  ["Property rights attorneys", "/who-its-for#property-rights"],
  ["Paralegals and law students", "/who-its-for#paralegals-students"],
] as const;

function Dropdown({
  label,
  href,
  items,
}: {
  label: string;
  href: string;
  items: readonly (readonly [string, string])[];
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        className="flex items-center gap-1 py-2 text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300"
      >
        {label} <span className="text-[9px] text-[#a39f8d]">▼</span>
      </Link>
      <div className="invisible absolute left-0 top-full z-20 w-64 rounded-xl border border-[#e3e1d5] bg-white p-2 opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 dark:border-neutral-700 dark:bg-[#30302e]">
        {items.map(([name, url]) => (
          <Link
            key={url}
            href={url}
            className="block rounded-lg px-3 py-2 text-[13px] text-[#5d5848] hover:bg-[#f5f4ee] dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#faf9f5] text-[#3d3929] dark:bg-[#262624] dark:text-neutral-200">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]"
        >
          Casewise
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <span className="hidden items-center gap-5 md:flex">
            <Link href="/how-it-works" className="py-2 text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
              How it works
            </Link>
            <Dropdown label="Features" href="/features" items={FEATURE_LINKS} />
            <Dropdown label="Who it's for" href="/who-its-for" items={AUDIENCE_LINKS} />
            <Link href="/blog" className="py-2 text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
              Blog
            </Link>
            <Link href="/pricing" className="py-2 text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
              Pricing
            </Link>
            <Link href="/about" className="py-2 text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
              About
            </Link>
          </span>
          <Link href="/pricing" className="py-2 text-[#5d5848] hover:text-[#3d3929] md:hidden dark:text-neutral-300">
            Pricing
          </Link>
          <Link
            href="/app"
            className="rounded-xl bg-[#1e3a5a] px-4 py-2 font-medium text-white transition-colors hover:bg-[#16304b]"
          >
            Open Casewise
          </Link>
        </nav>
      </header>
      {children}
      <footer className="mx-auto max-w-5xl border-t border-[#e8e6dc] px-6 py-8 text-xs text-[#a39f8d] dark:border-neutral-800 dark:text-neutral-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>© 2026 Casewise · casewise.si</span>
          <span className="flex flex-wrap gap-4">
            <Link href="/how-it-works" className="hover:text-[#5d5848]">How it works</Link>
            <Link href="/features" className="hover:text-[#5d5848]">Features</Link>
            <Link href="/who-its-for" className="hover:text-[#5d5848]">Who it&apos;s for</Link>
            <Link href="/blog" className="hover:text-[#5d5848]">Blog</Link>
            <Link href="/pricing" className="hover:text-[#5d5848]">Pricing</Link>
            <Link href="/about" className="hover:text-[#5d5848]">About</Link>
          </span>
        </div>
        <p className="mt-3 max-w-3xl">
          Casewise is a research tool for licensed attorneys. It does not provide legal
          advice, and its output must be independently verified against the cited sources
          before being relied upon. Building and agency data are indicators drawn from
          public records, not determinations.
        </p>
      </footer>
    </div>
  );
}
