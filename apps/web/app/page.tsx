"use client";

import { useEffect, useRef, useState } from "react";
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

type Exchange = { question: string; answer: AskResponse | null };

type SearchResult = {
  citation: string;
  heading: string | null;
  text: string;
  source_type: string;
  url: string | null;
  score: number;
};

type SourceFilter = "" | "statute" | "case" | "guidance" | "rule" | "form";

type HistoryEntry = {
  id: string;
  mode: "ask" | "search";
  query: string;
  sourceType: SourceFilter;
  at: string;
  answer?: AskResponse; // legacy single-answer entries
  thread?: Exchange[];
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
    /* storage unavailable */
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

function typeLabel(t: string): string {
  return t === "case" ? "decision" : t;
}

export default function Home() {
  const [mode, setMode] = useState<"ask" | "search">("ask");
  const [sourceType, setSourceType] = useState<SourceFilter>("");
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<Exchange[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [feedbackByIdx, setFeedbackByIdx] = useState<Record<number, "down" | "sent">>({});
  const [feedbackComment, setFeedbackComment] = useState("");
  const answerRefs = useRef<(HTMLElement | null)[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string>("");

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (mode === "ask" && (streamText || status === "loading")) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [streamText, status, mode, thread.length]);

  const hasContent = status !== "idle" || thread.length > 0 || results.length > 0;
  const shownResults =
    mode === "search" && sourceType
      ? results.filter((r) => r.source_type === sourceType)
      : results;

  function recordHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  }

  function deleteEntry(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((h) => !(h.id === entry.id && h.at === entry.at));
      saveHistory(next);
      return next;
    });
  }

  function restore(entry: HistoryEntry) {
    setMode(entry.mode);
    setQuery("");
    setSourceType(entry.sourceType);
    if (entry.mode === "ask") {
      const t =
        entry.thread ??
        (entry.answer ? [{ question: entry.query, answer: entry.answer }] : []);
      setThread(t);
      threadIdRef.current = entry.id;
      setResults([]);
    } else {
      setResults(entry.results ?? []);
      setThread([]);
      threadIdRef.current = "";
    }
    setError("");
    setStreamText("");
    setFeedbackByIdx({});
    setStatus("done");
  }

  function reset() {
    setQuery("");
    setThread([]);
    threadIdRef.current = "";
    setResults([]);
    setError("");
    setStreamText("");
    setFeedbackByIdx({});
    setStatus("idle");
  }

  async function runAskStream(q: string, priorThread: Exchange[]) {
    setStatusMsg("Connecting…");
    const historyTurns = priorThread
      .filter((x) => x.answer)
      .slice(-4)
      .map((x) => ({ question: x.question, answer: x.answer!.answer }));
    const res = await fetch(`${API_URL}/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, history: historyTurns }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === "status") setStatusMsg(event.message);
        else if (event.type === "delta") {
          acc += event.text;
          setStreamText(acc);
        } else if (event.type === "done") {
          const final: AskResponse = {
            answer: event.answer,
            sources: event.sources,
            model: event.model,
          };
          const newThread = [...priorThread, { question: q, answer: final }];
          setThread(newThread);
          setStreamText("");
          if (!threadIdRef.current) threadIdRef.current = `ask::${q}`;
          recordHistory({
            id: threadIdRef.current,
            mode: "ask",
            query: newThread[0].question,
            sourceType: "",
            at: new Date().toISOString(),
            thread: newThread,
          });
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;
    setStatus("loading");
    setError("");
    setStreamText("");
    setCopiedIdx(null);
    try {
      if (mode === "ask") {
        const prior = thread.filter((x) => x.answer);
        setThread([...prior, { question: q, answer: null }]);
        setQuery("");
        await runAskStream(q, prior);
      } else {
        setResults([]);
        const typeParam = sourceType ? `&type=${sourceType}` : "";
        const res = await fetch(
          `${API_URL}/search?q=${encodeURIComponent(q)}&k=12${typeParam}`
        );
        if (!res.ok) throw new Error((await res.json()).detail ?? `HTTP ${res.status}`);
        const data: SearchResult[] = await res.json();
        setResults(data);
        recordHistory({
          id: `search:${sourceType}:${q}`,
          mode: "search",
          query: q,
          sourceType,
          at: new Date().toISOString(),
          results: data,
        });
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setStatus("error");
    }
  }

  async function copyAnswer(idx: number) {
    const a = thread[idx]?.answer;
    if (!a) return;
    const sourcesPlain = a.sources
      .map(
        (s) =>
          `[${s.marker}] ${s.citation}${s.heading ? ` — ${s.heading}` : ""}${s.url ? ` (${s.url})` : ""}`
      )
      .join("\n");
    const plain = `${a.answer}\n\nSources:\n${sourcesPlain}`;
    const bodyHtml = answerRefs.current[idx]?.innerHTML ?? "";
    const sourcesHtml = a.sources
      .map(
        (s) =>
          `<li>[${s.marker}] ${s.url ? `<a href="${s.url}">${s.citation}</a>` : s.citation}${s.heading ? ` — ${s.heading}` : ""}</li>`
      )
      .join("");
    const html = `<div>${bodyHtml}<p><strong>Sources:</strong></p><ul>${sourcesHtml}</ul></div>`;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  async function sendFeedback(idx: number, rating: "up" | "down", comment?: string) {
    const x = thread[idx];
    if (!x?.answer) return;
    try {
      await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: x.question,
          answer: x.answer.answer,
          model: x.answer.model,
          rating,
          comment: comment || null,
        }),
      });
    } catch {
      /* best-effort */
    }
    setFeedbackByIdx((p) => ({
      ...p,
      [idx]: rating === "down" && !comment ? "down" : "sent",
    }));
    if (comment) setFeedbackComment("");
  }

  const grouped: [string, HistoryEntry[]][] = [];
  for (const h of history) {
    const label = groupLabel(h.at);
    const last = grouped[grouped.length - 1];
    if (last && last[0] === label) last[1].push(h);
    else grouped.push([label, [h]]);
  }

  const historyItem = (h: HistoryEntry) => (
    <li key={h.id + h.at} className="group relative">
      <button
        onClick={() => restore(h)}
        title={h.query}
        className="w-full truncate rounded-lg px-2 py-1.5 pr-7 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {h.query}
      </button>
      <button
        onClick={(e) => deleteEntry(e, h)}
        title="Delete"
        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded px-1.5 text-xs text-[#a39f8d] hover:text-[#c96442] group-hover:block"
      >
        ✕
      </button>
    </li>
  );

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
            ? thread.length
              ? "Ask a follow-up — the conversation is remembered…"
              : 'Ask a legal question, like "Can a tenant withhold rent for repairs?"'
            : "Search statutes, decisions, guidance, rules, forms…"
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
              onChange={(e) => setSourceType(e.target.value as SourceFilter)}
              className="ml-1 rounded-lg bg-transparent px-2 py-1.5 text-xs text-[#8a8571] outline-none dark:text-neutral-400"
            >
              <option value="">All sources</option>
              <option value="statute">Statutes</option>
              <option value="case">Court decisions</option>
              <option value="guidance">DHCR guidance</option>
              <option value="rule">Court rules</option>
              <option value="form">Forms</option>
            </select>
          )}
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-xl bg-[#c96442] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b55a3a] disabled:opacity-50"
        >
          {status === "loading"
            ? "Working…"
            : mode === "ask"
              ? thread.length
                ? "Follow up"
                : "Research"
              : "Search"}
        </button>
      </div>
    </form>
  );

  const answerCard = (x: Exchange, idx: number, streaming: boolean) => (
    <div key={idx} className="mt-6">
      <p className="mb-2 text-sm font-medium text-[#8a8571] dark:text-neutral-400">
        {x.question}
      </p>
      {streaming && !streamText ? (
        <p className="flex items-center gap-2 text-sm text-[#8a8571] dark:text-neutral-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#c96442]" />
          {statusMsg}
        </p>
      ) : (
        <article
          ref={(el) => {
            answerRefs.current[idx] = el;
          }}
          className="prose prose-sm max-w-none rounded-2xl border border-[#e3e1d5] bg-white p-6 [font-family:var(--font-serif)] dark:prose-invert dark:border-neutral-700 dark:bg-[#30302e] [&_table]:text-xs"
        >
          <ReactMarkdown>{x.answer ? x.answer.answer : streamText}</ReactMarkdown>
        </article>
      )}
      {x.answer && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyAnswer(idx)}
              className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {copiedIdx === idx ? "Copied ✓" : "Copy answer"}
            </button>
            {feedbackByIdx[idx] === "sent" ? (
              <span className="text-xs text-[#8a8571] dark:text-neutral-400">
                Thanks for the feedback ✓
              </span>
            ) : (
              <>
                <button
                  onClick={() => sendFeedback(idx, "up")}
                  title="Good answer"
                  className="rounded-lg border border-[#e3e1d5] bg-white px-2.5 py-1.5 text-xs hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:hover:bg-neutral-800"
                >
                  👍
                </button>
                <button
                  onClick={() => sendFeedback(idx, "down")}
                  title="Something's wrong"
                  className="rounded-lg border border-[#e3e1d5] bg-white px-2.5 py-1.5 text-xs hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:hover:bg-neutral-800"
                >
                  👎
                </button>
              </>
            )}
          </div>
          {feedbackByIdx[idx] === "down" && (
            <div className="mt-2 flex gap-2">
              <input
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="What was wrong or missing? (optional)"
                className="flex-1 rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs outline-none placeholder:text-[#a39f8d] dark:border-neutral-700 dark:bg-[#30302e]"
              />
              <button
                onClick={() => sendFeedback(idx, "down", feedbackComment.trim() || "(no comment)")}
                className="rounded-lg bg-[#c96442] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#b55a3a]"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
      {x.answer && x.answer.sources.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8a8571] dark:text-neutral-400">
            Verified sources
          </h2>
          <ul className="mt-2 space-y-1.5">
            {x.answer.sources.map((s) => (
              <li key={s.marker} className="flex items-baseline gap-2 text-sm">
                <span className="rounded bg-[#efede3] px-1.5 py-0.5 font-mono text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                  {s.marker}
                </span>
                <span className="shrink-0 rounded-full bg-[#efede3] px-2 py-0.5 text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                  {typeLabel(s.source_type)}
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
                <span className="text-[#8a8571] dark:text-neutral-400">{s.heading}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-dvh bg-[#faf9f5] text-[#3d3929] dark:bg-[#262624] dark:text-neutral-200">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[#e8e6dc] bg-[#f5f4ee] dark:border-neutral-800 dark:bg-[#1f1e1b] md:flex">
        <div className="flex items-baseline gap-2 px-4 pb-2 pt-5">
          <span className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]">
            Casewise
          </span>
          <span className="text-[10px] text-[#a39f8d] dark:text-neutral-500">V-2.1.0</span>
        </div>
        <button
          onClick={reset}
          className="mx-3 mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <span className="text-base leading-none text-[#c96442]">+</span> New research
        </button>
        <div className="mx-3 mt-0.5 flex cursor-default items-center justify-between rounded-lg px-3 py-2 text-sm text-[#a39f8d] dark:text-neutral-500">
          <span>New case prep</span>
          <span className="rounded-full bg-[#efede3] px-2 py-0.5 text-[10px] uppercase tracking-wide dark:bg-neutral-800">
            soon
          </span>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          {grouped.length === 0 ? (
            <p className="px-2 text-xs text-[#a39f8d] dark:text-neutral-500">
              Your questions and searches will appear here.
            </p>
          ) : (
            grouped.map(([label, entries]) => {
              const asks = entries.filter((h) => h.mode === "ask");
              const searches = entries.filter((h) => h.mode === "search");
              return (
                <div key={label} className="mb-4">
                  <div className="px-2 pb-1 text-xs font-medium text-[#a39f8d] dark:text-neutral-500">
                    {label}
                  </div>
                  {asks.length > 0 && (
                    <>
                      <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                        Ask results
                      </div>
                      <ul>{asks.map(historyItem)}</ul>
                    </>
                  )}
                  {searches.length > 0 && (
                    <>
                      <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                        Search results
                      </div>
                      <ul>{searches.map(historyItem)}</ul>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {history.length > 0 && (
          <button
            onClick={() => {
              setHistory([]);
              saveHistory([]);
            }}
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

            {status === "error" && (
              <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            {mode === "ask" &&
              thread.map((x, idx) =>
                answerCard(x, idx, status === "loading" && idx === thread.length - 1)
              )}

            {mode === "search" && status === "done" && shownResults.length === 0 && (
              <p className="mt-6 text-sm text-[#8a8571]">
                {results.length > 0
                  ? "No results of this type — change the filter."
                  : "No results."}
              </p>
            )}

            {mode === "search" && (
              <ul className="mt-6 space-y-4">
                {shownResults.map((r, i) => (
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
                          {typeLabel(r.source_type)}
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
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>
    </div>
  );
}
