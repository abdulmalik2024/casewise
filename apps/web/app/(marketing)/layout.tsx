import Link from "next/link";

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
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/features" className="text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
            Features
          </Link>
          <Link href="/pricing" className="text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
            Pricing
          </Link>
          <Link href="/about" className="text-[#5d5848] hover:text-[#3d3929] dark:text-neutral-300">
            About
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
          <span className="flex gap-4">
            <Link href="/features" className="hover:text-[#5d5848]">Features</Link>
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
