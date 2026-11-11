import Link from "next/link";
import AuthHashRedirect from "./AuthHashRedirect";

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
      <header className="sticky top-0 z-30 border-b border-[#e8e6dc]/70 bg-[#faf9f5]/85 backdrop-blur-md dark:border-neutral-800/70 dark:bg-[#262624]/85">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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
            className="cw-cta rounded-xl bg-[#1e3a5a] px-4 py-2 font-medium text-white hover:bg-[#16304b]"
          >
            Open Casewise
          </Link>
        </nav>
        </div>
      </header>
      <AuthHashRedirect />
      {children}
      <footer className="mx-auto max-w-5xl border-t border-[#e8e6dc] px-6 py-8 text-xs text-[#a39f8d] dark:border-neutral-800 dark:text-neutral-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span>© 2026 Casewise · casewise.si</span>
            <a
              href="https://www.linkedin.com/company/casewise-si/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Casewise on LinkedIn"
              className="hover:text-[#5d5848]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61595222507621"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Casewise on Facebook"
              className="hover:text-[#5d5848]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07z" />
              </svg>
            </a>
          </span>
          <span className="flex flex-wrap gap-4">
            <Link href="/how-it-works" className="hover:text-[#5d5848]">How it works</Link>
            <Link href="/features" className="hover:text-[#5d5848]">Features</Link>
            <Link href="/who-its-for" className="hover:text-[#5d5848]">Who it&apos;s for</Link>
            <Link href="/blog" className="hover:text-[#5d5848]">Blog</Link>
            <Link href="/challenge" className="hover:text-[#5d5848]">The challenge</Link>
            <Link href="/pricing" className="hover:text-[#5d5848]">Pricing</Link>
            <Link href="/about" className="hover:text-[#5d5848]">About</Link>
            <Link href="/privacy" className="hover:text-[#5d5848]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#5d5848]">Terms</Link>
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
