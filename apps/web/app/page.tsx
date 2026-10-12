"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type SearchResult = {
  citation: string;
  heading: string | null;
  text: string;
  source_type: string;
  url: string | null;
  score: number;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState("");

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setStatus("loading");
    try {
      const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}&k=8`);
      if (!res.ok) throw new Error((await res.json()).detail ?? `HTTP ${res.status}`);
      setResults(await res.json());
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "search failed");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Casewise</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Semantic search over New York property law — statutes and recent decisions.
          For licensed attorneys; not legal advice.
        </p>
      </header>

      <form onSubmit={runSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "notice required before raising rent"'
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {status === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      {status === "error" && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {status === "done" && results.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No results.</p>
      )}

      <ul className="mt-6 space-y-4">
        {results.map((r, i) => (
          <li
            key={i}
            className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="font-mono text-sm font-semibold">{r.citation}</span>
                {r.heading && (
                  <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-300">
                    {r.heading}
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {r.source_type} · {(r.score * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
              {r.text}
            </p>
            {r.url && (
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                View source ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
