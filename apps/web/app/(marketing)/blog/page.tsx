import Link from "next/link";
import { POSTS } from "./posts";

export default function Blog() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="pt-10 text-3xl tracking-tight [font-family:var(--font-serif)]">Blog</h1>
      <p className="mt-2 text-[#6b6450] dark:text-neutral-400">
        Notes on New York property law research and how Casewise is built.
      </p>
      <div className="mt-10 space-y-6">
        {POSTS.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="block rounded-2xl border border-[#e3e1d5] bg-white p-6 transition-colors hover:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
          >
            <div className="text-xs text-[#a39f8d]">{p.date}</div>
            <h3 className="mt-1 text-lg font-semibold [font-family:var(--font-serif)]">
              {p.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#5d5848] dark:text-neutral-300">
              {p.excerpt}
            </p>
            <span className="mt-2 inline-block text-sm text-[#1e3a5a] dark:text-blue-400">
              Read →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
