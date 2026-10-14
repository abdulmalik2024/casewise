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
  amended_after?: boolean;
};

type QuoteCheck = { total: number; verified: number; unverified: string[] };

type AskResponse = {
  answer: string;
  sources: Source[];
  model: string;
  quote_check?: QuoteCheck | null;
};

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

type AuditRow = {
  citation: string;
  kind: string;
  status: string;
  detail: string | null;
  url: string | null;
};

type AuditResponse = { rows: AuditRow[]; quotes: QuoteCheck };

type HistoryEntry = {
  id: string;
  mode: "ask" | "search" | "audit";
  query: string;
  sourceType: SourceFilter;
  at: string;
  answer?: AskResponse; // legacy single-answer entries
  thread?: Exchange[];
  results?: SearchResult[];
  audit?: AuditResponse;
  pinned?: boolean;
};

const AUDIT_STATUS: Record<string, { label: string; cls: string }> = {
  found_corpus: {
    label: "verified in corpus",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  found_courtlistener: {
    label: "verified (CourtListener)",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  not_found: {
    label: "NOT FOUND",
    cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  unchecked: {
    label: "verify manually",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
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
  if (t === "case") return "decision";
  if (t === "building") return "building record";
  return t;
}

export default function Home() {
  const [mode, setMode] = useState<"ask" | "search" | "audit">("ask");
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<SourceFilter>("");
  const [asOf, setAsOf] = useState("");
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<Exchange[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedCite, setCopiedCite] = useState<string | null>(null);
  const [feedbackByIdx, setFeedbackByIdx] = useState<Record<number, "down" | "sent">>({});
  const [feedbackComment, setFeedbackComment] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [sourcesCollapsed, setSourcesCollapsed] = useState<Record<number, boolean>>({});
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
    if (entry.mode === "audit") {
      setAuditResult(entry.audit ?? null);
      setThread([]);
      setResults([]);
      threadIdRef.current = "";
    } else if (entry.mode === "ask") {
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
    setCollapsed({});
    setSourcesCollapsed({});
    setStatus("done");
  }

  function togglePin(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.map((h) =>
        h.id === entry.id && h.at === entry.at ? { ...h, pinned: !h.pinned } : h
      );
      saveHistory(next);
      return next;
    });
  }

  function reset() {
    setQuery("");
    setAuditResult(null);
    setAuditFile(null);
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
      body: JSON.stringify({ q, history: historyTurns, as_of: asOf || null }),
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
            quote_check: event.quote_check ?? null,
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
    if (mode !== "audit" && q.length < 3) return;
    if (mode === "audit" && !auditFile && q.length < 50) {
      setError("Paste at least a paragraph of the document, or upload a PDF/Word file.");
      setStatus("error");
      return;
    }
    if (mode === "audit" && auditFile) {
      const limit = auditFile.name.toLowerCase().endsWith(".docx") ? 10 : 15;
      if (auditFile.size > limit * 1_000_000) {
        setError(`File is too large — the limit is ${limit}MB for this type.`);
        setStatus("error");
        return;
      }
    }
    setStatus("loading");
    setError("");
    setStreamText("");
    setCopiedIdx(null);
    try {
      if (mode === "audit") {
        setAuditResult(null);
        let res: Response;
        if (auditFile) {
          const fd = new FormData();
          fd.append("file", auditFile);
          res = await fetch(`${API_URL}/audit/pdf`, { method: "POST", body: fd });
        } else {
          res = await fetch(`${API_URL}/audit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: q }),
          });
        }
        if (!res.ok) throw new Error((await res.json()).detail ?? `HTTP ${res.status}`);
        const data: AuditResponse = await res.json();
        setAuditResult(data);
        const label = auditFile ? auditFile.name : q.slice(0, 60);
        recordHistory({
          id: `audit:${label}`,
          mode: "audit",
          query: `Audit: ${label}`,
          sourceType: "",
          at: new Date().toISOString(),
          audit: data,
        });
      } else if (mode === "ask") {
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

  async function copyCite(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCite(key);
      setTimeout(() => setCopiedCite(null), 1500);
    } catch {
      /* clipboard unavailable */
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

  async function exportMemo(idx: number) {
    const x = thread[idx];
    if (!x?.answer) return;
    try {
      const res = await fetch(`${API_URL}/memo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: x.question,
          answer: x.answer.answer,
          sources: x.answer.sources,
          quote_check: x.answer.quote_check ?? null,
          model: x.answer.model,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `casewise-memo-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("memo export failed; try again");
      setStatus("error");
    }
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

  const pinned = history.filter((h) => h.pinned);
  const grouped: [string, HistoryEntry[]][] = [];
  for (const h of history) {
    if (h.pinned) continue;
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
        className="w-full truncate rounded-lg px-2 py-1.5 pr-12 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {h.query}
      </button>
      <span className="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          onClick={(e) => togglePin(e, h)}
          title={h.pinned ? "Unpin" : "Pin to top"}
          className={`rounded px-1 text-xs ${
            h.pinned
              ? "text-[#c96442]"
              : "hidden text-[#a39f8d] hover:text-[#c96442] group-hover:inline-block"
          }`}
        >
          {h.pinned ? "★" : "☆"}
        </button>
        <button
          onClick={(e) => deleteEntry(e, h)}
          title="Delete"
          className="hidden rounded px-1 text-xs text-[#a39f8d] hover:text-[#c96442] group-hover:inline-block"
        >
          ✕
        </button>
      </span>
    </li>
  );

  const inputCard = (
    <form
      onSubmit={run}
      className="rounded-2xl border border-[#e3e1d5] bg-white shadow-[0_2px_12px_rgba(61,57,41,0.06)] dark:border-neutral-700 dark:bg-[#30302e]"
    >
      {mode === "audit" ? (
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={5}
          placeholder="Paste a brief, motion, or memo — yours or opposing counsel's. Every NY citation gets checked; quotes get matched to the sources. Or upload a PDF below."
          className="w-full resize-y bg-transparent px-5 pb-2 pt-4 text-[14px] outline-none placeholder:text-[#a39f8d] dark:placeholder:text-neutral-500"
        />
      ) : (
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
      )}
      <div className="flex items-center justify-between px-3 pb-3">
        <div className="flex items-center gap-1 text-xs">
          {(["ask", "search", "audit"] as const).map((m) => (
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
              {m === "ask" ? "Ask" : m === "search" ? "Search" : "Check cites"}
            </button>
          ))}
          {mode === "audit" && (
            <label className="ml-1 cursor-pointer text-xs text-[#8a8571] hover:text-[#5d5848] dark:text-neutral-400">
              {auditFile ? `📄 ${auditFile.name.slice(0, 24)}` : "Upload PDF/Word"}
              <input
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => setAuditFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          {mode === "audit" && auditFile && (
            <button type="button" onClick={() => setAuditFile(null)} className="text-xs text-[#a39f8d] hover:text-[#c96442]">
              ✕
            </button>
          )}
          {mode === "ask" && (
            <label className="ml-1 flex items-center gap-1.5 text-xs text-[#8a8571] dark:text-neutral-400">
              As of
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="rounded-lg border border-transparent bg-transparent px-1 py-1 text-xs outline-none hover:border-[#e3e1d5] dark:hover:border-neutral-700"
                title="Optional: research the law as of a past date. Decisions and guidance after this date are excluded; statutes amended after it are flagged."
              />
              {asOf && (
                <button type="button" onClick={() => setAsOf("")} className="text-[#a39f8d] hover:text-[#c96442]">
                  ✕
                </button>
              )}
            </label>
          )}
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
            : mode === "audit"
              ? "Check cites"
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
      <button
        onClick={() =>
          !streaming && setCollapsed((p) => ({ ...p, [idx]: !p[idx] }))
        }
        className="mb-2 flex w-full items-baseline gap-2 text-left"
        title={collapsed[idx] ? "Expand" : "Collapse"}
      >
        <span className="text-xs text-[#a39f8d] dark:text-neutral-500">
          {streaming ? "●" : collapsed[idx] ? "▸" : "▾"}
        </span>
        <span className="text-sm font-medium text-[#8a8571] dark:text-neutral-400">
          {x.question}
        </span>
      </button>
      {collapsed[idx] && !streaming ? null : streaming && !streamText ? (
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
      {x.answer && !collapsed[idx] && x.answer.quote_check && x.answer.quote_check.total > 0 && (
        <div className="mt-2 text-xs">
          {x.answer.quote_check.unverified.length === 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              ✓ All {x.answer.quote_check.total} quotation
              {x.answer.quote_check.total > 1 ? "s" : ""} verified word-for-word against the
              sources
            </span>
          ) : (
            <details className="text-amber-700 dark:text-amber-400">
              <summary className="cursor-pointer">
                ⚠ {x.answer.quote_check.unverified.length} of {x.answer.quote_check.total}{" "}
                quotations could not be matched to the sources — verify before relying
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {x.answer.quote_check.unverified.map((q, i) => (
                  <li key={i} className="italic">&ldquo;{q}&rdquo;</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {x.answer && !collapsed[idx] && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyAnswer(idx)}
              className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {copiedIdx === idx ? "Copied ✓" : "Copy answer"}
            </button>
            <button
              onClick={() => exportMemo(idx)}
              title="Download a Word research memo with a verification appendix"
              className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Export memo
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
      {x.answer && !collapsed[idx] && x.answer.sources.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setSourcesCollapsed((p) => ({ ...p, [idx]: !p[idx] }))}
            className="flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#8a8571] hover:text-[#5d5848] dark:text-neutral-400"
            title={sourcesCollapsed[idx] ? "Show sources" : "Hide sources"}
          >
            <span>{sourcesCollapsed[idx] ? "▸" : "▾"}</span> Verified sources (
            {x.answer.sources.length})
          </button>
          {sourcesCollapsed[idx] ? null : (
          <ul className="mt-2 space-y-1.5">
            {x.answer.sources.map((s) => (
              <li key={s.marker} className="group flex items-baseline gap-2 text-sm">
                <span className="rounded bg-[#efede3] px-1.5 py-0.5 font-mono text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                  {s.marker}
                </span>
                <span className="shrink-0 rounded-full bg-[#efede3] px-2 py-0.5 text-xs text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                  {typeLabel(s.source_type)}
                </span>
                {s.amended_after && (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    title="This section was amended after your as-of date; the text used is the current version."
                  >
                    amended after date
                  </span>
                )}
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
                <button
                  onClick={() => copyCite(s.marker + idx, s.citation)}
                  title="Copy citation"
                  className="hidden text-xs text-[#a39f8d] hover:text-[#c96442] group-hover:inline"
                >
                  {copiedCite === s.marker + idx ? "✓" : "⧉"}
                </button>
                <span className="text-[#8a8571] dark:text-neutral-400">{s.heading}</span>
              </li>
            ))}
          </ul>
          )}
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
          <span className="text-[10px] text-[#a39f8d] dark:text-neutral-500">V-2.3.0</span>
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
          {pinned.length > 0 && (
            <div className="mb-4">
              <div className="px-2 pb-1 text-xs font-medium text-[#a39f8d] dark:text-neutral-500">
                Pinned
              </div>
              <ul>{pinned.map(historyItem)}</ul>
            </div>
          )}
          {grouped.length === 0 && pinned.length === 0 ? (
            <p className="px-2 text-xs text-[#a39f8d] dark:text-neutral-500">
              Your questions and searches will appear here.
            </p>
          ) : (
            grouped.map(([label, entries]) => {
              const asks = entries.filter((h) => h.mode === "ask");
              const searches = entries.filter((h) => h.mode === "search");
              const audits = entries.filter((h) => h.mode === "audit");
              return (
                <div key={label} className="mb-4">
                  <div className="px-2 pb-1 text-xs font-medium text-[#a39f8d] dark:text-neutral-500">
                    {label}
                  </div>
                  {asks.length > 0 && (
                    <>
                      <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                        Chat results
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
                  {audits.length > 0 && (
                    <>
                      <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                        Cite checks
                      </div>
                      <ul>{audits.map(historyItem)}</ul>
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

            {mode === "audit" && auditResult && (
              <div className="mt-6">
                <div className="rounded-2xl border border-[#e3e1d5] bg-white p-5 dark:border-neutral-700 dark:bg-[#30302e]">
                  <h2 className="text-sm font-semibold">
                    Citation audit — {auditResult.rows.length} citation
                    {auditResult.rows.length === 1 ? "" : "s"} found
                    {auditResult.rows.some((r) => r.status === "not_found") && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                        {auditResult.rows.filter((r) => r.status === "not_found").length} not
                        found
                      </span>
                    )}
                  </h2>
                  <table className="mt-3 w-full text-left text-sm">
                    <tbody>
                      {auditResult.rows.map((r, i) => (
                        <tr key={i} className="group border-t border-[#efede3] dark:border-neutral-800">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {r.citation}
                            <button
                              onClick={() => copyCite(`audit${i}`, r.citation)}
                              title="Copy citation"
                              className="ml-1.5 hidden text-[#a39f8d] hover:text-[#c96442] group-hover:inline"
                            >
                              {copiedCite === `audit${i}` ? "✓" : "⧉"}
                            </button>
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${(AUDIT_STATUS[r.status] ?? AUDIT_STATUS.unchecked).cls}`}
                            >
                              {(AUDIT_STATUS[r.status] ?? AUDIT_STATUS.unchecked).label}
                            </span>
                          </td>
                          <td className="py-2 text-xs text-[#8a8571] dark:text-neutral-400">
                            {r.url ? (
                              <a href={r.url} target="_blank" rel="noreferrer" className="text-[#c96442] hover:underline">
                                {r.detail}
                              </a>
                            ) : (
                              r.detail
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditResult.quotes.total > 0 && (
                    <p className="mt-3 text-xs">
                      {auditResult.quotes.unverified.length === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          ✓ {auditResult.quotes.verified} quotation
                          {auditResult.quotes.verified === 1 ? "" : "s"} matched the cited
                          sources word-for-word
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">
                          ⚠ {auditResult.quotes.unverified.length} quotation
                          {auditResult.quotes.unverified.length === 1 ? "" : "s"} did not match
                          the cited sources
                        </span>
                      )}
                    </p>
                  )}
                  <p className="mt-3 text-[11px] text-[#a39f8d] dark:text-neutral-500">
                    Statutes, 22 NYCRR rules, and recent slip opinions are checked against the
                    Casewise corpus; reporter citations via CourtListener. A verified citation
                    is not an opinion on whether it remains good law.
                  </p>
                </div>
              </div>
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
