"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Source = {
  marker: string;
  citation: string;
  heading: string | null;
  url: string | null;
  source_type: string;
};

type AskResponse = { answer: string; sources: Source[]; model: string };

type SearchResult = {
  citation: string;
  heading: string | null;
  text: string;
  source_type: string;
  url: string | null;
  score: number;
};

function relevance(score: number): { label: string; cls: string } {
  if (score >= 0.5)
    return {
      label: "Strong match",
      cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    };
  if (score >= 0.4)
    return {
      label: "Relevant",
      cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    };
  return {
    label: "Related",
    cls: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
  };
}

export default function Home() {
  const [mode, setMode] = useState<"ask" | "search">("ask");
  const [sourceType, setSourceType] = useState<"" | "statute" | "case">("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setStatus("loading");
    setAnswer(null);
    setResults([]);
    try {
      const endpoint = mode === "ask" ? "ask" : "search";
      const typeParam = mode === "search" && sourceType ? `&type=${sourceType}` : "";
      const res = await fetch(
        `${API_URL}/${endpoint}?q=${encodeURIComponent(query)}${typeParam}`
      );
      if (!res.ok) throw new Error((await res.json()).detail ?? `HTTP ${res.status}`);
      if (mode === "ask") setAnswer(await res.json());
      else setResults(await res.json());
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Casewise</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          AI research assistant for New York property law. For licensed attorneys;
          not legal advice — verify all citations.
        </p>
      </header>

      <div className="mb-3 flex gap-1 text-sm">
        {(["ask", "search"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 capitalize ${
              mode === m
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {m === "ask" ? "Ask" : "Search sources"}
          </button>
        ))}
      </div>

      <form onSubmit={run} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "ask"
              ? 'e.g. "How much notice before an 8% rent increase?"'
              : 'e.g. "warranty of habitability"'
          }
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {status === "loading" ? (mode === "ask" ? "Researching…" : "Searching…") : "Go"}
        </button>
      </form>

      {mode === "search" && (
        <div className="mt-3 flex gap-1 text-xs">
          {([["", "All sources"], ["statute", "Statutes"], ["case", "Court decisions"]] as const).map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() => setSourceType(value)}
                className={`rounded-full border px-3 py-1 ${
                  sourceType === value
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
      )}

      {status === "loading" && mode === "ask" && (
        <p className="mt-6 text-sm text-neutral-500">
          Retrieving sources and drafting a cited answer — typically 20–60 seconds…
        </p>
      )}

      {status === "error" && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-6">
          <article className="prose prose-sm prose-neutral max-w-none rounded-xl border border-neutral-200 p-5 dark:prose-invert dark:border-neutral-800 [&_table]:text-xs">
            <ReactMarkdown>{answer.answer}</ReactMarkdown>
          </article>
          {answer.sources.length > 0 && (
            <div className="mt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Verified sources
              </h2>
              <ul className="mt-2 space-y-1.5">
                {answer.sources.map((s) => (
                  <li key={s.marker} className="flex items-baseline gap-2 text-sm">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {s.marker}
                    </span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {s.citation}
                      </a>
                    ) : (
                      <span className="font-mono font-medium">{s.citation}</span>
                    )}
                    <span className="text-neutral-500">{s.heading}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mode === "search" && status === "done" && results.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No results.</p>
      )}

      <ul className="mt-6 space-y-4">
        {results.map((r, i) => (
          <li key={i} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="font-mono text-sm font-semibold">{r.citation}</span>
                {r.heading && (
                  <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-300">
                    {r.heading}
                  </span>
                )}
              </div>
              <span className="flex shrink-0 gap-1.5">
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {r.source_type === "case" ? "decision" : r.source_type}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${relevance(r.score).cls}`}>
                  {relevance(r.score).label}
                </span>
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
