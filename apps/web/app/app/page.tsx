"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
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

type DraftCheck = {
  missing_sections: string[];
  uncited_rule_paragraphs: number;
  markers_only_in_application: string[];
  fact_gaps: string[];
  passed: boolean;
};

type AskResponse = {
  answer: string;
  sources: Source[];
  model: string;
  quote_check?: QuoteCheck | null;
  draft_check?: DraftCheck | null;
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
  mode: "ask" | "search" | "audit" | "draft";
  query: string;
  sourceType: SourceFilter;
  at: string;
  answer?: AskResponse; // legacy single-answer entries
  thread?: Exchange[];
  results?: SearchResult[];
  audit?: AuditResponse;
  facts?: string; // draft mode: the case facts the attorney provided
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

const GUEST_LIMIT = 5;

// shown in rotation while the model reads sources and drafts (the quiet stretch)
const WAITING_LINES = [
  "Lining up the governing statutes…",
  "Comparing the decisions on point…",
  "Checking how the authorities fit together…",
  "Drafting, with every citation pinned to a source…",
  "Almost there; quotations get verified next…",
];
const STATUS_VERBS = ["Reading", "Checking", "Comparing"];

const EXAMPLE_QUESTIONS = [
  {
    label: "Habitability defenses",
    q: "What habitability defenses can a tenant raise in a nonpayment proceeding?",
  },
  {
    label: "Month-to-month termination",
    q: "What notice must a landlord give to terminate a month-to-month tenancy in NYC?",
  },
  {
    label: "Security deposits",
    q: "How quickly must a landlord return a security deposit, and what can be deducted?",
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryTerms(q: string): string[] {
  const phrases = Array.from(q.matchAll(/["""]([^"""]{2,100})["""]/g), (m) => m[1]);
  if (phrases.length) return phrases;
  return q.split(/\s+/).filter((w) => w.length >= 4).slice(0, 6);
}

function countMatches(text: string, term: string): number {
  const t = term.trim();
  if (t.length < 2) return 0;
  return (text.match(new RegExp(escapeRegExp(t), "gi")) ?? []).length;
}

function highlightText(text: string, terms: string[], findTerm: string): React.ReactNode {
  const find = findTerm.trim();
  const all = [...(find.length >= 2 ? [find] : []), ...terms].filter((t) => t.length >= 2);
  if (all.length === 0) return text;
  const re = new RegExp(`(${all.map(escapeRegExp).join("|")})`, "gi");
  // split with a capturing group alternates non-match / match segments
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded bg-[#f3e9c9] px-0.5 text-inherit dark:bg-[#5a4d1e]"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function guestId(): string {
  try {
    let id = localStorage.getItem("casewise-guest-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("casewise-guest-id", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

// authority-type index colors (muted; bars + badges only) and panel ordering:
// statutes before decisions before guidance — the hierarchy of authority
const TYPE_COLOR: Record<string, string> = {
  statute: "#1e3a5a",
  case: "#2f6b4f",
  guidance: "#a16d1f",
  rule: "#6b5b8a",
  form: "#8a8571",
  building: "#b05c3b",
};
const TYPE_ORDER: Record<string, number> = {
  statute: 0,
  case: 1,
  guidance: 2,
  rule: 3,
  form: 4,
  building: 5,
};

function typeLabel(t: string): string {
  if (t === "case") return "decision";
  if (t === "building") return "building record";
  return t;
}

export default function Home() {
  const [mode, setMode] = useState<"ask" | "search" | "audit" | "draft">("ask");
  const [facts, setFacts] = useState("");
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [auditTab, setAuditTab] = useState<"paste" | "upload">("paste");
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
  const router = useRouter();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [guestLeft, setGuestLeft] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingCites, setPendingCites] = useState<string[]>([]);
  const [expandedResults, setExpandedResults] = useState<Record<number, boolean>>({});
  const [findInResult, setFindInResult] = useState<Record<number, string>>({});
  const [lastSearchQ, setLastSearchQ] = useState("");
  const answerRefs = useRef<(HTMLElement | null)[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const threadIdRef = useRef<string>("");

  useEffect(() => {
    setHistory(loadHistory());
    try {
      if (localStorage.getItem("casewise-sidebar") === "closed") setSidebarOpen(false);
    } catch {
      /* storage unavailable */
    }
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem("casewise-sidebar", open ? "closed" : "open");
      } catch {
        /* storage unavailable */
      }
      return !open;
    });
  }

  useEffect(() => {
    const sb = supabase();
    // no session = guest preview (GUEST_LIMIT free questions), not a redirect
    sb.auth.getSession().then(({ data }) => {
      const sess = data.session;
      setAuthToken(sess?.access_token ?? null);
      setAuthEmail(sess?.user.email ?? "");
      setAuthChecked(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      setAuthToken(sess?.access_token ?? null);
      setAuthEmail(sess?.user.email ?? "");
      setAuthChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isGuest = authChecked && !authToken;

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.plan === "trial") setDaysLeft(d.days_left);
      })
      .catch(() => {});
  }, [authToken]);

  useEffect(() => {
    if (!isGuest) return;
    fetch(`${API_URL}/guest/status`, { headers: { "X-Guest-Id": guestId() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.remaining === "number") setGuestLeft(d.remaining);
      })
      .catch(() => {});
  }, [isGuest]);

  // while the model is thinking (loading, nothing streamed yet), rotate the
  // status line through the retrieved citations, or honest generic lines
  useEffect(() => {
    if (status !== "loading" || streamText) return;
    const lines = pendingCites.length
      ? pendingCites.map((c, i) => `${STATUS_VERBS[i % STATUS_VERBS.length]} ${c}…`)
      : WAITING_LINES;
    let i = 0;
    const id = setInterval(() => {
      setStatusMsg(lines[i % lines.length]);
      i += 1;
    }, 3500);
    return () => clearInterval(id);
  }, [status, streamText, pendingCites]);

  // the answer window scrolls internally; follow the streaming text inside it
  useEffect(() => {
    if ((mode === "ask" || mode === "draft") && streamText) {
      const el = answerRefs.current[thread.length - 1];
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [streamText, mode, thread.length]);

  const authHeaders = (): Record<string, string> =>
    authToken ? { Authorization: `Bearer ${authToken}` } : { "X-Guest-Id": guestId() };

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
    setMobileNavOpen(false);
    setMode(entry.mode);
    setQuery("");
    setSourceType(entry.sourceType);
    if (entry.mode === "audit") {
      setAuditResult(entry.audit ?? null);
      setThread([]);
      setResults([]);
      threadIdRef.current = "";
    } else if (entry.mode === "ask" || entry.mode === "draft") {
      const t =
        entry.thread ??
        (entry.answer ? [{ question: entry.query, answer: entry.answer }] : []);
      setThread(t);
      threadIdRef.current = entry.id;
      setResults([]);
      if (entry.mode === "draft") setFacts(entry.facts ?? "");
    } else {
      setResults(entry.results ?? []);
      setExpandedResults({});
      setFindInResult({});
      setLastSearchQ(entry.query);
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
    setMobileNavOpen(false);
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
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ q, history: historyTurns, as_of: asOf || null }),
    });
    if (res.status === 401) {
      if (authToken) router.replace("/login");
      throw new Error("Please sign in.");
    }
    if (res.status === 402) throw new Error((await res.json()).detail ?? "Your trial has ended.");
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const rem = res.headers.get("X-Guest-Remaining");
    if (rem !== null) setGuestLeft(Number(rem));
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
        else if (event.type === "sources_preview") setPendingCites(event.citations ?? []);
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

  async function runDraftStream(issue: string, factsText: string) {
    setStatusMsg("Connecting…");
    const res = await fetch(`${API_URL}/draft/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ issue, facts: factsText, as_of: asOf || null }),
    });
    if (res.status === 401) {
      if (authToken) router.replace("/login");
      throw new Error("Please sign in.");
    }
    if (res.status === 402) throw new Error((await res.json()).detail ?? "Your trial has ended.");
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
        else if (event.type === "sources_preview") setPendingCites(event.citations ?? []);
        else if (event.type === "delta") {
          acc += event.text;
          setStreamText(acc);
        } else if (event.type === "done") {
          const final: AskResponse = {
            answer: event.answer,
            sources: event.sources,
            model: event.model,
            quote_check: event.quote_check ?? null,
            draft_check: event.draft_check ?? null,
          };
          setThread([{ question: issue, answer: final }]);
          setStreamText("");
          const id = `draft::${issue}`;
          threadIdRef.current = id;
          recordHistory({
            id,
            mode: "draft",
            query: `Draft: ${issue.slice(0, 60)}`,
            sourceType: "",
            at: new Date().toISOString(),
            thread: [{ question: issue, answer: final }],
            facts: factsText,
          });
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    }
  }

  async function askMoreDetail() {
    if (status === "loading") return;
    const prior = thread.filter((x) => x.answer);
    setCollapsed(Object.fromEntries(prior.map((_, i) => [i, true])));
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    const lastQ = prior[prior.length - 1]?.question.slice(0, 380) ?? "";
    const q = `Go deeper on ${lastQ || "the last answer"}: fuller analysis of the key authorities, exceptions, and edge cases.`;
    setThread([...prior, { question: q, answer: null }]);
    setStatus("loading");
    setError("");
    setStreamText("");
    setPendingCites([]);
    setCopiedIdx(null);
    try {
      await runAskStream(q, prior);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setStatus("error");
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!authToken && mode !== "ask") {
      setError(
        "Search, Check cites, and Draft need a free account: 7-day trial, no credit card. " +
          "Guest preview covers Ask."
      );
      setStatus("error");
      return;
    }
    const q = query.trim();
    if (mode !== "audit" && q.length < 3) return;
    if (mode === "draft" && q.length < 10) {
      setError("Frame the legal issue in a sentence (at least 10 characters).");
      setStatus("error");
      return;
    }
    if (mode === "draft" && facts.trim().length < 50) {
      setError(
        "Add the facts of the case (at least a paragraph). Anonymize names and addresses."
      );
      setStatus("error");
      return;
    }
    const activeAuditFile = auditTab === "upload" ? auditFile : null;
    if (mode === "audit" && !activeAuditFile && q.length < 50) {
      setError("Paste at least a paragraph of the document, or upload a PDF/Word file.");
      setStatus("error");
      return;
    }
    if (mode === "audit" && activeAuditFile) {
      const limit = activeAuditFile.name.toLowerCase().endsWith(".docx") ? 10 : 15;
      if (activeAuditFile.size > limit * 1_000_000) {
        setError(`File is too large; the limit is ${limit}MB for this type.`);
        setStatus("error");
        return;
      }
    }
    setStatus("loading");
    setError("");
    setStreamText("");
    setPendingCites([]);
    setCopiedIdx(null);
    try {
      if (mode === "audit") {
        setAuditResult(null);
        let res: Response;
        if (activeAuditFile) {
          const fd = new FormData();
          fd.append("file", activeAuditFile);
          res = await fetch(`${API_URL}/audit/pdf`, { method: "POST", body: fd, headers: authHeaders() });
        } else {
          res = await fetch(`${API_URL}/audit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ text: q }),
          });
        }
        if (!res.ok) throw new Error((await res.json()).detail ?? `HTTP ${res.status}`);
        const data: AuditResponse = await res.json();
        setAuditResult(data);
        const label = activeAuditFile ? activeAuditFile.name : q.slice(0, 60);
        recordHistory({
          id: `audit:${label}`,
          mode: "audit",
          query: `Audit: ${label}`,
          sourceType: "",
          at: new Date().toISOString(),
          audit: data,
        });
      } else if (mode === "draft") {
        setThread([{ question: q, answer: null }]);
        await runDraftStream(q, facts.trim());
      } else if (mode === "ask") {
        const prior = thread.filter((x) => x.answer);
        // follow-up swaps in place: prior exchanges fold to one-line rows and
        // the view returns to the top, where the new answer streams
        setCollapsed(Object.fromEntries(prior.map((_, i) => [i, true])));
        setSourcesCollapsed({});
        mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        setThread([...prior, { question: q, answer: null }]);
        setQuery("");
        await runAskStream(q, prior);
      } else {
        setResults([]);
        setExpandedResults({});
        setFindInResult({});
        setLastSearchQ(q);
        const typeParam = sourceType ? `&type=${sourceType}` : "";
        const res = await fetch(
          `${API_URL}/search?q=${encodeURIComponent(q)}&k=12${typeParam}`,
          { headers: authHeaders() }
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
          `[${s.marker}] ${s.citation}${s.heading ? ` · ${s.heading}` : ""}${s.url ? ` (${s.url})` : ""}`
      )
      .join("\n");
    const plain = `${a.answer}\n\nSources:\n${sourcesPlain}`;
    const bodyHtml = answerRefs.current[idx]?.innerHTML ?? "";
    const sourcesHtml = a.sources
      .map(
        (s) =>
          `<li>[${s.marker}] ${s.url ? `<a href="${s.url}">${s.citation}</a>` : s.citation}${s.heading ? ` · ${s.heading}` : ""}</li>`
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
        headers: { "Content-Type": "application/json", ...authHeaders() },
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
        headers: { "Content-Type": "application/json", ...authHeaders() },
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
              ? "text-[#1e3a5a]"
              : "hidden text-[#a39f8d] hover:text-[#1e3a5a] group-hover:inline-block"
          }`}
        >
          {h.pinned ? "★" : "☆"}
        </button>
        <button
          onClick={(e) => deleteEntry(e, h)}
          title="Delete"
          className="hidden rounded px-1 text-xs text-[#a39f8d] hover:text-[#1e3a5a] group-hover:inline-block"
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
        <div className="px-5 pt-4">
          <div className="flex items-center gap-4 text-[11px] text-[#a39f8d] dark:text-neutral-500">
            {["Add your document", "Check citations", "Review matches"].map((step, i) => {
              const current =
                status === "done" && auditResult ? 2 : status === "loading" ? 1 : 0;
              return (
                <span key={step} className="flex items-center gap-1.5">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                      i <= current
                        ? "bg-[#1e3a5a] text-white"
                        : "bg-[#efede3] text-[#8a8571] dark:bg-neutral-800"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={i === current ? "font-medium text-[#5d5848] dark:text-neutral-300" : ""}>
                    {step}
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-3 flex gap-1 text-xs">
            {(["paste", "upload"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setAuditTab(t)}
                className={`rounded-lg px-3 py-1.5 ${
                  auditTab === t
                    ? "bg-[#efede3] font-medium text-[#3d3929] dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-[#8a8571] hover:bg-[#f5f4ee] dark:text-neutral-400"
                }`}
              >
                {t === "paste" ? "Paste text" : "Upload file"}
              </button>
            ))}
          </div>
          {auditTab === "paste" ? (
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={5}
              placeholder="Paste a brief, motion, or memo, yours or opposing counsel's. NY case citations are checked against official records from any year; quoted text is matched word for word to the sources."
              className="mt-2 w-full resize-y bg-transparent pb-2 text-[14px] outline-none placeholder:text-[#a39f8d] dark:placeholder:text-neutral-500"
            />
          ) : (
            <label className="mt-2 mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#d8d5c5] px-4 py-8 text-sm text-[#8a8571] hover:border-[#1e3a5a] hover:text-[#5d5848] dark:border-neutral-700 dark:text-neutral-400">
              {auditFile ? (
                <>
                  <span className="font-medium text-[#3d3929] dark:text-neutral-200">
                    📄 {auditFile.name}
                  </span>
                  <span className="text-xs">Click to choose a different file</span>
                </>
              ) : (
                <>
                  <span>Choose a PDF or Word file</span>
                  <span className="text-xs">15MB PDF / 10MB Word. No scanned images yet.</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => setAuditFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      ) : mode === "draft" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='The legal issue, e.g. "Can the tenant assert a warranty-of-habitability defense to this nonpayment petition?"'
            className="w-full bg-transparent px-5 pb-1 pt-4 text-[15px] outline-none placeholder:text-[#a39f8d] dark:placeholder:text-neutral-500"
          />
          <textarea
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            rows={6}
            placeholder="The facts of the case: dates, conditions, notices, payments, who did what. Anonymize names and addresses. The draft will only use facts you provide here; gaps are flagged, never assumed."
            className="w-full resize-y border-t border-[#f0eee4] bg-transparent px-5 pb-2 pt-3 text-[14px] outline-none placeholder:text-[#a39f8d] dark:border-neutral-800 dark:placeholder:text-neutral-500"
          />
        </>
      ) : (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "ask"
              ? thread.length
                ? "Ask a follow-up; the conversation is remembered…"
                : 'Ask a legal question, like "Can a tenant withhold rent for repairs?"'
              : 'Search statutes, decisions, guidance… put "exact phrases" in quotes'
          }
          className="w-full bg-transparent px-5 pb-2 pt-4 text-[15px] outline-none placeholder:text-[#a39f8d] dark:placeholder:text-neutral-500"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-3 pb-3">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
          {(["ask", "search", "audit", "draft"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
                mode === m
                  ? "bg-[#efede3] font-medium text-[#3d3929] dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-[#8a8571] hover:bg-[#f5f4ee] dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {m === "ask"
                ? "Ask"
                : m === "search"
                  ? "Search"
                  : m === "audit"
                    ? "Check cites"
                    : "Draft IRAC"}
            </button>
          ))}
          {mode === "audit" && (
            <span className="ml-1 text-[11px] text-[#a39f8d] dark:text-neutral-500">
              Processed in memory. Never saved.
            </span>
          )}
          {(mode === "ask" || mode === "draft") && (
            <label className="ml-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-[#8a8571] dark:text-neutral-400">
              Research date
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="rounded-lg border border-transparent bg-transparent px-1 py-1 text-xs outline-none hover:border-[#e3e1d5] dark:hover:border-neutral-700"
                title="Optional: research the law as of a past date. Decisions and guidance after this date are excluded; statutes amended after it are flagged."
              />
              {asOf ? (
                <button type="button" onClick={() => setAsOf("")} className="text-[#a39f8d] hover:text-[#1e3a5a]">
                  ✕
                </button>
              ) : (
                <span className="text-[#bcb8a5] dark:text-neutral-600">current law</span>
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
          className="ml-auto rounded-xl bg-[#1e3a5a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#16304b] disabled:opacity-50"
        >
          {status === "loading"
            ? "Working…"
            : mode === "audit"
              ? "Check citations"
              : mode === "draft"
                ? "Draft IRAC"
                : mode === "ask"
                  ? thread.length
                    ? "Follow up"
                    : "Research"
                  : "Search"}
        </button>
      </div>
    </form>
  );

  // last exchange whose sources the desktop side panel shows
  const panelIdx = (() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const a = thread[i]?.answer;
      if (a && a.sources.length > 0) return i;
    }
    return -1;
  })();

  const verificationBanner = (a: AskResponse) => {
    if (a.sources.length === 0) return null;
    const qc = a.quote_check;
    const quotesClean = !qc || qc.total === 0 || qc.unverified.length === 0;
    const draftClean = !a.draft_check || a.draft_check.passed;
    const clean = quotesClean && draftClean;
    return (
      <div
        className={`mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 text-xs ${
          clean
            ? "bg-[#1e3a5a] text-white"
            : "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        }`}
      >
        <span className="font-semibold">
          ✓ {a.sources.length} citation{a.sources.length === 1 ? "" : "s"} verified
        </span>
        {qc && qc.total > 0 && (
          <span>
            {qc.verified} of {qc.total} quoted passage{qc.total === 1 ? "" : "s"} matched
            word for word
          </span>
        )}
        {a.draft_check && <span>IRAC structure {draftClean ? "checks passed" : "flagged below"}</span>}
        {clean && (
          <span className="ml-auto rounded-full border border-white/30 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-white/90">
            Verified against sources
          </span>
        )}
      </div>
    );
  };

  const authoritiesPanel = (a: AskResponse) => (
    <div className="rounded-2xl border border-[#e8e6dc] bg-[#f5f4ee] p-5 dark:border-neutral-800 dark:bg-[#1f1e1b]">
      <h3 className="text-lg tracking-tight [font-family:var(--font-serif)]">
        Verified authorities
      </h3>
      <ul className="mt-3 space-y-3">
        {[...a.sources]
          .sort(
            (x, y) =>
              (TYPE_ORDER[x.source_type] ?? 9) - (TYPE_ORDER[y.source_type] ?? 9)
          )
          .map((s) => (
          <li
            key={s.marker}
            className="overflow-hidden rounded-xl border border-[#e3e1d5] bg-white text-xs dark:border-neutral-700 dark:bg-[#30302e]"
          >
            <div
              className="h-1"
              style={{ background: TYPE_COLOR[s.source_type] ?? "#8a8571" }}
            />
            <div className="p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-[#efede3] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
                {typeLabel(s.source_type)}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Verified
              </span>
              {s.amended_after && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  amended after date
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] text-[#a39f8d]">{s.marker}</span>
            </div>
            <div className="mt-1.5 font-mono text-[13px] font-semibold text-[#3d3929] dark:text-neutral-200">
              {s.citation}
            </div>
            {s.heading && s.heading !== s.citation && (
              <div className="mt-0.5 text-[#6b6450] dark:text-neutral-400">{s.heading}</div>
            )}
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-block text-[#1e3a5a] hover:underline dark:text-blue-400"
              >
                Open official text ↗
              </a>
            )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-[#8a8571] dark:text-neutral-500">
        Every citation maps to a retrieved document. Review the authorities before relying
        on the answer.
      </p>
    </div>
  );

  const auditLegendPanel = (
    <div className="rounded-2xl border border-[#e8e6dc] bg-[#f5f4ee] p-5 dark:border-neutral-800 dark:bg-[#1f1e1b]">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#a39f8d] dark:text-neutral-500">
        What you will see
      </div>
      <h3 className="mt-1 text-lg tracking-tight [font-family:var(--font-serif)]">
        Clear match statuses
      </h3>
      <ul className="mt-3 space-y-2.5 text-xs">
        <li className="rounded-xl border border-[#e3e1d5] bg-white p-3 dark:border-neutral-700 dark:bg-[#30302e]">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">✓ Matched</span>
          <div className="mt-0.5 text-[#6b6450] dark:text-neutral-400">
            Citation found in source records, with a link to the text.
          </div>
        </li>
        <li className="rounded-xl border border-[#e3e1d5] bg-white p-3 dark:border-neutral-700 dark:bg-[#30302e]">
          <span className="font-semibold text-amber-700 dark:text-amber-400">● Not found</span>
          <div className="mt-0.5 text-[#6b6450] dark:text-neutral-400">
            No matching source located. Treat as suspect and verify by hand.
          </div>
        </li>
        <li className="rounded-xl border border-[#e3e1d5] bg-white p-3 dark:border-neutral-700 dark:bg-[#30302e]">
          <span className="font-semibold text-red-700 dark:text-red-400">✕ Quote mismatch</span>
          <div className="mt-0.5 text-[#6b6450] dark:text-neutral-400">
            Quoted wording differs from the source text.
          </div>
        </li>
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-[#8a8571] dark:text-neutral-500">
        Coverage: NY case citations in all official reporters, any year; slip opinions;
        and statute citations across the twelve NY laws in the library (RPL, RPAPL,
        CPLR, GOL, MDL, ETPA, UCC, GBL, Banking, BCL, N-PCL, Lien Law).
      </p>
      <p className="mt-2 text-[11px] leading-snug text-[#8a8571] dark:text-neutral-500">
        <span className="font-medium">Your document stays private.</span> Processed in
        memory, never saved.
      </p>
    </div>
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
      {x.answer && !collapsed[idx] && verificationBanner(x.answer)}
      {collapsed[idx] && !streaming ? null : streaming && !streamText ? (
        <p className="flex items-center gap-2.5 text-sm text-[#8a8571] dark:text-neutral-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/owl/casewise-owl-256.webp" alt="" className="cw-owl-bob h-9 w-9" />
          {statusMsg}
        </p>
      ) : (
        <article
          ref={(el) => {
            answerRefs.current[idx] = el;
          }}
          className="prose prose-sm max-h-[62vh] max-w-none overflow-y-auto rounded-2xl border border-[#e3e1d5] bg-white p-6 [font-family:var(--font-serif)] dark:prose-invert dark:border-neutral-700 dark:bg-[#30302e] [&_table]:text-xs"
        >
          <ReactMarkdown>{x.answer ? x.answer.answer : streamText}</ReactMarkdown>
        </article>
      )}
      {x.answer && !collapsed[idx] && x.answer.draft_check && (
        <div className="mt-2 text-xs">
          {x.answer.draft_check.passed ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              ✓ IRAC structure check passed: all sections present, every rule proposition
              cited, application relies only on authorities the rule introduced
            </span>
          ) : (
            <div className="text-amber-700 dark:text-amber-400">
              ⚠ Structure check:
              <ul className="mt-1 list-inside list-disc">
                {x.answer.draft_check.missing_sections.length > 0 && (
                  <li>missing section{x.answer.draft_check.missing_sections.length > 1 ? "s" : ""}: {x.answer.draft_check.missing_sections.join(", ")}</li>
                )}
                {x.answer.draft_check.uncited_rule_paragraphs > 0 && (
                  <li>{x.answer.draft_check.uncited_rule_paragraphs} rule paragraph{x.answer.draft_check.uncited_rule_paragraphs > 1 ? "s" : ""} without a citation</li>
                )}
                {x.answer.draft_check.markers_only_in_application.length > 0 && (
                  <li>application cites {x.answer.draft_check.markers_only_in_application.join(", ")} without introducing {x.answer.draft_check.markers_only_in_application.length > 1 ? "them" : "it"} in the rule</li>
                )}
              </ul>
            </div>
          )}
          {x.answer.draft_check.fact_gaps.length > 0 && (
            <div className="mt-1 text-[#8a8571] dark:text-neutral-400">
              Facts the draft needs from you: {x.answer.draft_check.fact_gaps.join("; ")}
            </div>
          )}
        </div>
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
                quotations: check wording against the source before citing. Not an exact
                match.
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {x.answer.quote_check.unverified.map((q, i) => (
                  <li key={i} className="italic">&ldquo;{q}&rdquo;</li>
                ))}
              </ul>
              <p className="mt-1 text-[#8a8571] dark:text-neutral-400">
                Every quotation is compared word-for-word to the stored source text; anything
                that isn&apos;t an exact match is flagged here instead of silently shown.
              </p>
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
            {idx === thread.length - 1 && mode === "ask" && (
              <button
                onClick={askMoreDetail}
                title="Expand this answer: authorities, exceptions, edge cases"
                className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Go deeper
              </button>
            )}
            {authToken ? (
              <button
                onClick={() => exportMemo(idx)}
                title="Download a Word research memo with a verification appendix"
                className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Export memo
              </button>
            ) : (
              <Link
                href="/signup"
                className="text-xs text-[#1e3a5a] hover:underline dark:text-blue-400"
              >
                Create a free account to export memos →
              </Link>
            )}
            {!authToken ? null : feedbackByIdx[idx] === "sent" ? (
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
                className="rounded-lg bg-[#1e3a5a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#16304b]"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
      {x.answer && !collapsed[idx] && x.answer.sources.length > 0 && (
        <div className={`mt-4 ${idx === panelIdx ? "lg:hidden" : ""}`}>
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
                    className="font-mono font-medium text-[#1e3a5a] hover:underline"
                  >
                    {s.citation}
                  </a>
                ) : (
                  <span className="font-mono font-medium">{s.citation}</span>
                )}
                <button
                  onClick={() => copyCite(s.marker + idx, s.citation)}
                  title="Copy citation"
                  className="hidden text-xs text-[#a39f8d] hover:text-[#1e3a5a] group-hover:inline"
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

  if (!authChecked) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#faf9f5] text-sm text-[#a39f8d] dark:bg-[#262624] dark:text-neutral-500">
        Opening Casewise…
      </div>
    );
  }

  const sidebarInner = (
    <>
          <div className="flex items-baseline justify-between px-4 pb-2 pt-5">
            <Link href="/" title="Back to casewise.si" className="flex items-baseline gap-2 hover:opacity-80">
              <span className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]">
                Casewise
              </span>
              <span className="text-[10px] text-[#a39f8d] dark:text-neutral-500">V-2.12.0</span>
            </Link>
            <button
              onClick={toggleSidebar}
              title="Hide sidebar"
              className="hidden rounded-md px-1.5 py-0.5 text-sm text-[#a39f8d] hover:bg-[#eae8dc] hover:text-[#5d5848] dark:hover:bg-neutral-800 md:block"
            >
              «
            </button>
          </div>
          <button
            onClick={reset}
            className="mx-3 mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span className="text-base leading-none text-[#1e3a5a]">+</span> New research
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
                const drafts = entries.filter((h) => h.mode === "draft");
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
                    {drafts.length > 0 && (
                      <>
                        <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                          IRAC drafts
                        </div>
                        <ul>{drafts.map(historyItem)}</ul>
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
          <div className="border-t border-[#e8e6dc] px-4 py-3 text-xs dark:border-neutral-800">
            {authToken ? (
              <>
                <div className="truncate text-[#5d5848] dark:text-neutral-300">{authEmail}</div>
                {daysLeft !== null && (
                  <div className="mt-0.5 text-[#a39f8d] dark:text-neutral-500">
                    Free trial: {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                  </div>
                )}
                <div className="mt-1 flex gap-3">
                  {daysLeft !== null && (
                    <Link
                      href="/pricing"
                      className="font-medium text-[#1e3a5a] hover:underline dark:text-blue-400"
                    >
                      Upgrade
                    </Link>
                  )}
                  <button
                    onClick={async () => {
                      await supabase().auth.signOut();
                    }}
                    className="text-[#1e3a5a] hover:underline dark:text-blue-400"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[#5d5848] dark:text-neutral-300">Guest preview</div>
                <div className="mt-0.5 text-[#a39f8d] dark:text-neutral-500">
                  {guestLeft !== null
                    ? `${guestLeft} of ${GUEST_LIMIT} free questions left`
                    : `${GUEST_LIMIT} free questions, no sign-up`}
                </div>
                <div className="mt-1 flex gap-3">
                  <Link href="/signup" className="text-[#1e3a5a] hover:underline dark:text-blue-400">
                    Start free trial
                  </Link>
                  <Link href="/login" className="text-[#1e3a5a] hover:underline dark:text-blue-400">
                    Sign in
                  </Link>
                </div>
              </>
            )}
            <div className="mt-3 border-t border-[#e8e6dc] pt-2 text-[11px] leading-snug text-[#a39f8d] dark:border-neutral-800 dark:text-neutral-500">
              <div className="font-medium text-[#8a8571] dark:text-neutral-400">Private by design</div>
              Questions stay in this browser. They are not stored on our servers.
            </div>
          </div>
    </>
  );

  return (
    <div className="flex h-dvh bg-[#faf9f5] text-[#3d3929] dark:bg-[#262624] dark:text-neutral-200">
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          title="Show sidebar"
          className="fixed left-3 top-4 z-10 hidden h-8 w-8 items-center justify-center rounded-lg border border-[#e3e1d5] bg-white text-sm text-[#5d5848] shadow-sm hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 md:flex"
        >
          »
        </button>
      )}
      {sidebarOpen && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#e8e6dc] bg-[#f5f4ee] dark:border-neutral-800 dark:bg-[#1f1e1b] md:flex">
          {sidebarInner}
        </aside>
      )}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-[#e8e6dc] bg-[#f5f4ee] shadow-xl dark:border-neutral-800 dark:bg-[#1f1e1b]">
            <div className="flex justify-end px-3 pt-3">
              <button onClick={() => setMobileNavOpen(false)} className="rounded-md px-2 py-0.5 text-[#a39f8d] hover:text-[#5d5848]">
                ✕
              </button>
            </div>
            {sidebarInner}
          </aside>
        </div>
      )}

      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8e6dc] bg-[#faf9f5]/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-[#262624]/95 md:hidden">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight [font-family:var(--font-serif)]">
              Casewise
            </span>
            <span className="text-[10px] text-[#a39f8d] dark:text-neutral-500">V-2.12.0</span>
          </Link>
          <button
            onClick={() => setMobileNavOpen(true)}
            title="Menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5a] text-white"
          >
            ☰
          </button>
        </div>
        {!hasContent ? (
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/owl/casewise-owl-256.webp" alt="" className="mx-auto mb-4 h-16 w-16" />
              <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#a39f8d] dark:text-neutral-500">
                New York legal research
              </p>
              <h1 className="mb-3 text-balance text-center text-3xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-4xl">
                What are you researching today?
              </h1>
              <p className="mb-7 text-center text-sm text-[#8a8571] dark:text-neutral-400">
                Ask a question, search authorities, check citations, or draft an IRAC memo
                with verified sources.
              </p>
              {inputCard}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                  Try a common question
                </span>
                {EXAMPLE_QUESTIONS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => {
                      setMode("ask");
                      setQuery(ex.q);
                    }}
                    className="rounded-full border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-center text-xs text-[#a39f8d] dark:text-neutral-500">
                SI research assistant for New York property law. For licensed attorneys;
                not legal advice. Verify all citations.
              </p>
              {isGuest && (
                <p className="mt-2 text-center text-xs text-[#8a8571] dark:text-neutral-400">
                  Guest preview: ask up to {GUEST_LIMIT} questions free, no sign-up.{" "}
                  <Link
                    href="/signup"
                    className="text-[#1e3a5a] hover:underline dark:text-blue-400"
                  >
                    Start your 7-day trial
                  </Link>{" "}
                  for search, cite checking, and memo export.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className={`mx-auto px-4 py-8 ${((mode === "ask" || mode === "draft") && panelIdx >= 0) || mode === "audit" ? "max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8" : "max-w-3xl"}`}>
            <div className="mx-auto w-full max-w-3xl min-w-0">
            <button
              onClick={reset}
              className="mb-3 flex items-center gap-1.5 text-xs text-[#8a8571] hover:text-[#1e3a5a] dark:text-neutral-400 dark:hover:text-blue-400"
            >
              ← New research
            </button>
            {inputCard}

            {status === "error" && (
              <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            {(mode === "ask" || mode === "draft") &&
              thread.map((x, idx) =>
                answerCard(x, idx, status === "loading" && idx === thread.length - 1)
              )}

            {mode === "audit" && auditResult && (
              <div className="mt-6">
                <div className="rounded-2xl border border-[#e3e1d5] bg-white p-5 dark:border-neutral-700 dark:bg-[#30302e]">
                  <h2 className="text-sm font-semibold">
                    Citation audit: {auditResult.rows.length} citation
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
                              className="ml-1.5 hidden text-[#a39f8d] hover:text-[#1e3a5a] group-hover:inline"
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
                              <a href={r.url} target="_blank" rel="noreferrer" className="text-[#1e3a5a] hover:underline">
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

            {status === "loading" && (mode === "search" || mode === "audit") && (
              <div
                role="status"
                className="mt-12 flex flex-col items-center gap-3 text-sm font-medium text-[#1e3a5a] dark:text-blue-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/owl/casewise-owl-256.webp" alt="" className="cw-owl-bob h-20 w-20" />
                <span>{mode === "audit" ? "Checking citations…" : "Searching the library…"}</span>
              </div>
            )}

            {mode === "search" && status === "done" && shownResults.length === 0 && (
              <p className="mt-6 text-sm text-[#8a8571]">
                {results.length > 0
                  ? "No results of this type. Change the filter."
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
                    <p
                      className={`mt-2 whitespace-pre-line text-sm text-[#5d5848] dark:text-neutral-300 ${
                        expandedResults[i] ? "" : "line-clamp-4"
                      }`}
                    >
                      {highlightText(r.text, queryTerms(lastSearchQ), findInResult[i] ?? "")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button
                        onClick={() =>
                          setExpandedResults((p) => ({ ...p, [i]: !p[i] }))
                        }
                        className="text-xs text-[#1e3a5a] hover:underline dark:text-blue-400"
                      >
                        {expandedResults[i] ? "Collapse ▴" : "Read full text ▾"}
                      </button>
                      {expandedResults[i] && (
                        <span className="flex items-center gap-2">
                          <input
                            value={findInResult[i] ?? ""}
                            onChange={(e) =>
                              setFindInResult((p) => ({ ...p, [i]: e.target.value }))
                            }
                            placeholder="Find a word or phrase in this text…"
                            className="w-56 rounded-lg border border-[#e3e1d5] bg-white px-2.5 py-1 text-xs outline-none placeholder:text-[#a39f8d] focus:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#262624]"
                          />
                          {(findInResult[i] ?? "").trim().length >= 2 && (
                            <span className="text-xs text-[#8a8571] dark:text-neutral-400">
                              {countMatches(r.text, findInResult[i] ?? "")} match
                              {countMatches(r.text, findInResult[i] ?? "") === 1 ? "" : "es"}
                            </span>
                          )}
                        </span>
                      )}
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#1e3a5a] hover:underline"
                        >
                          View source ↗
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div ref={bottomRef} />
            </div>
            {(((mode === "ask" || mode === "draft") && panelIdx >= 0 && thread[panelIdx]?.answer) || mode === "audit") && (
              <aside className="hidden lg:sticky lg:top-8 lg:block lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
                {mode === "audit" ? auditLegendPanel : authoritiesPanel(thread[panelIdx].answer!)}
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
