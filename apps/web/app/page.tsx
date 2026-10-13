"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const HISTORY_KEY = "casewise-history";
const HISTORY_MAX = 30;

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

type HistoryEntry = {
  id: string;
  mode: "ask" | "search";
  query: string;
  sourceType: "" | "statute" | "case";
  at: string;
  answer?: AskResponse;
  results?: SearchResult[];
};

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
  } catch {
    /* storage unavailable — history just doesn't persist */
  }
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

function relevance(score: number): { label: string; cls: string } {
  if (score >= 0.5)
    return {
      label: "Strong match",
      cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    };
  if (score >= 0.4)
    return {
      label: "Relevant",
      cls: "bg-[#efede3] text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-300",
    };
  return {
    label: "Related",
    cls: "bg-[#efede3] text-[#a39f8d] dark:bg-neutral-800 dark:text-neutral-500",
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const hasContent = status !== "idle" || answer !== null || results.length > 0;

  function recordHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  }

  function restore(entry: HistoryEntry) {
    setMode(entry.mode);
    setQuery(entry.query);
    setSourceType(entry.sourceType);
    setAnswer(entry.answer ?? null);
    setResults(entry.results ?? []);
    setError("");
    setStatus("done");
  }

  function reset() {
    setQuery("");
    setAnswer(null);
    setResults([]);
    setError("");
    setStatus("idle");
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;
    setStatus("loading");
    setAnswer(null);
    setResults([]);
    try {
      const endpoint = mode === "ask" ? "ask" : "search";
      const typeParam = mode === "search" && sourceType ? `&type=${sourceType}` : "";
      const res = await fetch(`${API_URL}/${endpoint}?q=${encodeURIComponent(q)}${typeParam}`);
      if (!res.ok) throw new Error((await res.json()).detail ?? `HTTP ${res.status}`);
      const entry: HistoryEntry = {
        id: `${mode}:${sourceType}:${q}`,
        mode,
        query: q,
        sourceType,
        at: new Date().toISOString(),
      };
      if (mode === "ask") {
        entry.answer = await res.json();
        setAnswer(entry.answer!);
      } else {
        entry.results = await res.json();
        setResults(entry.results!);
      }
      recordHistory(entry);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setStatus("error");
    }
  }

  const grouped: [string, HistoryEntry[]][] = [];
  for (const h of history) {
    const label = groupLabel(h.at);
    const last = grouped[grouped.length - 1];
    if (last && last[0] === label) last[1].push(h);
    else grouped.push([label, [h]]);
  }

  const inputCard = (
    <form
      onSubmit={run}
      className="rounded-2xl border border-[#e3e1d5] bg-white shadow-[0_2px_12px_rgba(61,57,41,0.06)] dark:border-neutral-700 dark:bg-[#30302e]"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          mode === "ask"
            ? "What would you like to research?"
            : "Search statutes and decisions…"
        }
        className="w-full bg-transparent px-5 pb-2 pt-4 text-[15px] outline-none placeholder:text-[#a39f8d] dark:placeholder:text-neutral-500"
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <div className="flex items-center gap-1 text-xs">
          {(["ask", "search"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 ${
                mode === m
                  ? "bg-[#efede3] font-medium text-[#3d3929] dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-[#8a8571] hover:bg-[#f5f4ee] dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {m === "ask" ? "Ask" : "Search"}
            </button>
          ))}
          {mode === "search" && (
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
              className="ml-1 rounded-lg bg-transparent px-2 py-1.5 text-xs text-[#8a8571] outline-none dark:text-neutral-400"
            >
              <option value="">All sources</option>
              <option value="statute">Statutes</option>
              <option value="case">Court decisions</option>
            </select>
          )}
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-xl bg-[#c96442] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b55a3a] disabled:opacity-50"
        >
          {status === "loading" ? "Working…" : mode === "ask" ? "Research" : "Search"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex h-dvh bg-[#faf9f5] text-[#3d3929] dark:bg-[#262624] dark:text-neutral-200">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[#e8e6dc] bg-[#f5f4ee] dark:border-neutral-800 dark:bg-[#1f1e1b] md:flex">
        <div className="px-4 pb-2 pt-5">
          <span className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]">
            Casewise
          </span>
        </div>
        <button
          onClick={reset}
          className="mx-3 mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <span className="text-base leading-none text-[#c96442]">+</span> New research
        </button>

        <div className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
          {grouped.length === 0 ? (
            <p className="px-2 text-xs text-[#a39f8d] dark:text-neutral-500">
              Your questions and searches will appear here.
            </p>
          ) : (
            grouped.map(([label, entries]) => (
              <div key={label} className="mb-4">
                <div className="px-2 pb-1 text-xs text-[#a39f8d] dark:text-neutral-500">
                  {label}
                </div>
                <ul>
                  {entries.map((h) => (
                    <li key={h.id + h.at}>
                      <button
                        onClick={() => restore(h)}
                        title={h.query}
                        className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        {h.query}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="mx-3 mb-4 rounded-lg px-2 py-1 text-left text-xs text-[#a39f8d] hover:text-[#5d5848] dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            Clear history
          </button>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto">
        {!hasContent ? (
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              <h1 className="mb-8 text-balance text-center text-3xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-4xl">
                Find the law. Understand the precedent.
                <br className="hidden md:block" /> Build your case.
              </h1>
              {inputCard}
              <p className="mt-6 text-center text-xs text-[#a39f8d] dark:text-neutral-500">
                SI research assistant for New York property law. For licensed attorneys;
                not legal advice. Verify all citations.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-8">
            {inputCard}

            {status === "loading" && mode === "ask" && (
              <p className="mt-6 text-sm text-[#8a8571] dark:text-neutral-400">
                Retrieving sources and drafting a cited answer. Typically 20–60 seconds…
              </p>
            )}

            {status === "error" && (
              <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            {answer && (
              <div className="mt-6">
                <article className="prose prose-sm max-w-none rounded-2xl border border-[#e3e1d5] bg-white p-6 [font-family:var(--font-serif)] dark:prose-invert dark:border-neutral-700 dark:bg-[#30302e] [&_table]:text-xs">
                  <ReactMarkdown>{answer.answer}</ReactMarkdown>
                </article>
                {answer.sources.length > 0 && (
                  <div className="mt-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8a8571] dark:text-neutral-400">
                      Verified sources
                    </h2>
                    <ul className="mt-2 space-y-1.5">
                      {answer.sources.map((s) => (
                        <li key={s.marker} className="flex items-baseline gap-2 text-sm">
                          <span className="rounded bg-[#efede3] px-1.5 py-0.5 font-mono text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                            {s.marker}
                          </span>
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono font-medium text-[#c96442] hover:underline"
                            >
                              {s.citation}
                            </a>
                          ) : (
                            <span className="font-mono font-medium">{s.citation}</span>
                          )}
                          <span className="text-[#8a8571] dark:text-neutral-400">
                            {s.heading}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {mode === "search" && status === "done" && results.length === 0 && (
              <p className="mt-6 text-sm text-[#8a8571]">No results.</p>
            )}

            <ul className="mt-6 space-y-4">
              {results.map((r, i) => (
                <li
                  key={i}
                  className="rounded-2xl border border-[#e3e1d5] bg-white p-4 dark:border-neutral-700 dark:bg-[#30302e]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <span className="font-mono text-sm font-semibold">{r.citation}</span>
                      {r.heading && (
                        <span className="ml-2 text-sm text-[#6b6450] dark:text-neutral-300">
                          {r.heading}
                        </span>
                      )}
                    </div>
                    <span className="flex shrink-0 gap-1.5">
                      <span className="rounded-full bg-[#efede3] px-2 py-0.5 text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                        {r.source_type === "case" ? "decision" : r.source_type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${relevance(r.score).cls}`}
                      >
                        {relevance(r.score).label}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-[#5d5848] dark:text-neutral-300">
                    {r.text}
                  </p>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-[#c96442] hover:underline"
                    >
                      View source ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
