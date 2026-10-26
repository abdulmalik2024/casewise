"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
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
  authority_meter?: {
    level: string;
    reasons: string[];
  } | null;
  missing_sections?: string[];
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
  mode: "ask" | "search" | "audit" | "draft" | "caseprep";
  query: string;
  sourceType: SourceFilter;
  at: string;
  answer?: AskResponse; // legacy single-answer entries
  thread?: Exchange[];
  results?: SearchResult[];
  audit?: AuditResponse;
  facts?: string; // draft/caseprep: the case facts the attorney provided
  objective?: string; // caseprep
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

type Mode = "ask" | "search" | "audit" | "draft" | "caseprep";
const SLUG_TO_MODE: Record<string, Mode> = {
  ask: "ask",
  search: "search",
  check: "audit",
  draft: "draft",
  "case-prep": "caseprep",
};
const MODE_TO_SLUG: Record<Mode, string> = {
  ask: "ask",
  search: "search",
  audit: "check",
  draft: "draft",
  caseprep: "case-prep",
};

const OBJECTIVES: { id: string; label: string }[] = [
  { id: "evaluate-claim", label: "Evaluate the claim" },
  { id: "assess-defenses", label: "Assess defenses" },
  { id: "prepare-motion", label: "Prepare for a motion" },
  { id: "pre-litigation", label: "Pre-litigation check" },
];

const CASEPREP_TABS = [
  "Overview",
  "Supporting arguments",
  "Counterarguments",
  "Ruling paths",
  "Appeal exposure",
  "Missing facts",
  "Next steps",
];

function splitSections(answer: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current = "Overview";
  let buf: string[] = [];
  for (const line of answer.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    const name = m ? CASEPREP_TABS.find((s) => s.toLowerCase() === m[1].trim().toLowerCase()) : undefined;
    if (name) {
      if (buf.join("").trim()) out[current] = (out[current] ? out[current] + "\n" : "") + buf.join("\n");
      current = name;
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (buf.join("").trim()) out[current] = (out[current] ? out[current] + "\n" : "") + buf.join("\n");
  return out;
}

function WsIcon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "ask":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a9 9 0 0 1 9-9h1a8 8 0 0 1 8 9z" />
          <path d="M9.5 10a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9.9-.9 1.7" />
          <circle cx="12" cy="17" r="0.2" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.8-3.8" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M9 3h6l4 4v14H5V3h4z" />
          <path d="m9 13 2 2 4-4" />
        </svg>
      );
    case "draft":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case "caseprep":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 21h18" />
          <path d="M12 6 6 7l-3 6a3 3 0 0 0 6 0L6 7M12 6l6 1 3 6a3 3 0 0 1-6 0l3-6" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
  }
}

const WORKSPACES: { slug: string; label: string; hint: string; icon: string }[] = [
  { slug: "ask", label: "Ask", hint: "cited answers", icon: "ask" },
  { slug: "search", label: "Search", hint: "the sources", icon: "search" },
  { slug: "check", label: "Check cites", hint: "audit a brief", icon: "check" },
  { slug: "draft", label: "Draft IRAC", hint: "issue + facts", icon: "draft" },
  { slug: "case-prep", label: "Case Prep", hint: "both sides", icon: "caseprep" },
];

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

function Home() {
  const pathname = usePathname();
  const wsSlug = pathname.split("/")[2] ?? "";
  const isHub = wsSlug === "";
  const mode: Mode = SLUG_TO_MODE[wsSlug] ?? "ask";
  // workspace moves are shallow history updates: the component stays mounted,
  // so threads and inputs survive switching; usePathname tracks pushState
  function goWorkspace(path: string) {
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }
  const [facts, setFacts] = useState("");
  const [objective, setObjective] = useState("evaluate-claim");
  const [prepTab, setPrepTab] = useState("Overview");
  const [showAsOf, setShowAsOf] = useState(false);
  const [scenario, setScenario] = useState("");
  const [activeScenario, setActiveScenario] = useState("");
  const [matters, setMatters] = useState<{ id: string; title: string; dispute: string }[]>([]);
  const [showSaveMatter, setShowSaveMatter] = useState(false);
  const [matterTitle, setMatterTitle] = useState("");
  const [savedMatter, setSavedMatter] = useState("");
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
    fetch(`${API_URL}/matters`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setMatters(d))
      .catch(() => {});
  }, [authToken]);

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
    if ((mode === "ask" || mode === "draft" || mode === "caseprep") && streamText) {
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
    goWorkspace(`/app/${MODE_TO_SLUG[entry.mode] ?? "ask"}`);
    setQuery("");
    setSourceType(entry.sourceType);
    if (entry.mode === "audit") {
      setAuditResult(entry.audit ?? null);
      setThread([]);
      setResults([]);
      threadIdRef.current = "";
    } else if (entry.mode === "ask" || entry.mode === "draft" || entry.mode === "caseprep") {
      const t =
        entry.thread ??
        (entry.answer ? [{ question: entry.query, answer: entry.answer }] : []);
      setThread(t);
      threadIdRef.current = entry.id;
      setResults([]);
      if (entry.mode === "draft" || entry.mode === "caseprep") setFacts(entry.facts ?? "");
      if (entry.mode === "caseprep") {
        setObjective(entry.objective ?? "evaluate-claim");
        setPrepTab("Overview");
      }
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

  async function runCasePrepStream(dispute: string, factsText: string, scenarioText?: string) {
    setStatusMsg("Connecting…");
    const res = await fetch(`${API_URL}/caseprep/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ dispute, facts: factsText, objective, scenario: scenarioText || null, as_of: asOf || null }),
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
            authority_meter: event.authority_meter ?? null,
            missing_sections: event.missing_sections ?? [],
          };
          setThread([{ question: dispute, answer: final }]);
          setStreamText("");
          setPrepTab("Overview");
          setActiveScenario(scenarioText ?? "");
          setSavedMatter("");
          setShowSaveMatter(false);
          const id = `caseprep::${dispute}`;
          threadIdRef.current = id;
          recordHistory({
            id,
            mode: "caseprep",
            query: `Case prep: ${dispute.slice(0, 60)}`,
            sourceType: "",
            at: new Date().toISOString(),
            thread: [{ question: dispute, answer: final }],
            facts: factsText,
            objective,
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
        "Search, Check cites, Draft, and Case Prep need a free account: 7-day trial, no credit card. " +
          "Guest preview covers Ask."
      );
      setStatus("error");
      return;
    }
    const q = query.trim();
    if (mode !== "audit" && q.length < 3) return;
    if ((mode === "draft" || mode === "caseprep") && q.length < 10) {
      setError("Frame the legal issue in a sentence (at least 10 characters).");
      setStatus("error");
      return;
    }
    if ((mode === "draft" || mode === "caseprep") && facts.trim().length < 50) {
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
      } else if (mode === "caseprep") {
        setThread([{ question: q, answer: null }]);
        await runCasePrepStream(q, facts.trim());
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
              placeholder="Paste a brief, motion, or memo, yours or opposing counsel's. NY case citations are checked against 5.1 million official records going back to the 1800s; quoted text is matched word for word to the sources."
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
      ) : mode === "caseprep" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='The dispute in one line, e.g. "Buyer seeks deposit back after discovering water damage before closing"'
            className="w-full bg-transparent px-5 pb-1 pt-4 text-[15px] outline-none placeholder:text-[#a39f8d] dark:placeholder:text-neutral-500"
          />
          <div className="flex flex-wrap items-center gap-1.5 px-5 pb-1 pt-1">
            <span className="text-[10px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
              Objective
            </span>
            {OBJECTIVES.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => setObjective(o.id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  objective === o.id
                    ? "bg-[#1e3a5a] text-white"
                    : "border border-[#e3e1d5] text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:text-neutral-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <textarea
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            rows={6}
            placeholder="The facts: dates, documents, who did what, what each side wants. Anonymize names and addresses. Missing facts are flagged, never assumed."
            className="w-full resize-y border-t border-[#f0eee4] bg-transparent px-5 pb-2 pt-3 text-[14px] outline-none placeholder:text-[#a39f8d] dark:border-neutral-800 dark:placeholder:text-neutral-500"
          />
        </>
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
          {mode === "audit" && (
            <span className="ml-1 text-[11px] text-[#a39f8d] dark:text-neutral-500">
              Processed in memory. Never saved.
            </span>
          )}
          {(mode === "ask" || mode === "draft" || mode === "caseprep") &&
            (asOf || showAsOf ? (
              <label className="ml-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-[#8a8571] dark:text-neutral-400">
                As of
                <input
                  type="date"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                  className="rounded-lg border border-[#e3e1d5] bg-transparent px-1 py-1 text-xs outline-none dark:border-neutral-700"
                  title="Research the law as of a past date. Decisions and guidance after this date are excluded; statutes amended after it are flagged."
                />
                <button
                  type="button"
                  onClick={() => {
                    setAsOf("");
                    setShowAsOf(false);
                  }}
                  className="text-[#a39f8d] hover:text-[#1e3a5a]"
                >
                  ✕
                </button>
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setShowAsOf(true)}
                title="Research the law as of a past date: decisions and guidance after that date are excluded."
                className="ml-1 whitespace-nowrap text-xs text-[#bcb8a5] hover:text-[#5d5848] dark:text-neutral-600 dark:hover:text-neutral-300"
              >
                Current law ▾
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
          className="ml-auto rounded-xl bg-[#1e3a5a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#16304b] disabled:opacity-50"
        >
          {status === "loading"
            ? "Working…"
            : mode === "audit"
              ? "Check citations"
              : mode === "draft"
                ? "Draft IRAC"
                : mode === "caseprep"
                  ? "Analyze dispute"
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
        Coverage: NY case citations in all official reporters, 5.1 million records
        going back to the 1800s; slip opinions; and statute citations across the
        twelve NY laws in the library (RPL, RPAPL, CPLR, GOL, MDL, ETPA, UCC, GBL,
        Banking, BCL, N-PCL, Lien Law).
      </p>
      <p className="mt-2 text-[11px] leading-snug text-[#8a8571] dark:text-neutral-500">
        <span className="font-medium">Your document stays private.</span> Processed in
        memory, never saved.
      </p>
    </div>
  );

  async function runScenario(whatIf: string) {
    if (status === "loading" || !whatIf.trim()) return;
    const dispute = thread[0]?.question ?? "";
    setThread([{ question: dispute, answer: null }]);
    setStatus("loading");
    setError("");
    setStreamText("");
    setPendingCites([]);
    setScenario("");
    try {
      await runCasePrepStream(dispute, facts.trim(), whatIf.trim());
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setStatus("error");
    }
  }

  function scenarioChips(sections: Record<string, string>): string[] {
    const body = sections["Missing facts"] ?? "";
    const qs = body
      .split("\n")
      .map((l) => l.replace(/^[-*•\s]+/, "").trim())
      .filter((l) => l.includes("?"))
      .map((l) => {
        const q = l.split("?")[0];
        const tail = q.includes(".") ? q.slice(q.lastIndexOf(".") + 1) : q;
        return tail.trim() + "?";
      })
      .filter((q) => q.length > 15 && q.length < 140);
    return qs.slice(0, 3);
  }

  async function saveMatter() {
    const a = thread[0]?.answer;
    if (!a || matterTitle.trim().length < 2) return;
    try {
      const res = await fetch(`${API_URL}/matters`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: matterTitle.trim(),
          dispute: thread[0].question,
          objective,
          scenario: activeScenario || null,
          facts: facts.trim(),
          analysis: a,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedMatter(matterTitle.trim());
      setShowSaveMatter(false);
      setMatterTitle("");
      const list = await fetch(`${API_URL}/matters`, { headers: authHeaders() }).then((r) =>
        r.ok ? r.json() : matters
      );
      if (Array.isArray(list)) setMatters(list);
    } catch {
      setError("Could not save the matter; try again.");
      setStatus("error");
    }
  }

  async function openMatter(id: string) {
    try {
      const res = await fetch(`${API_URL}/matters/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = await res.json();
      setMobileNavOpen(false);
      goWorkspace("/app/case-prep");
      setFacts(m.facts ?? "");
      setObjective(m.objective ?? "evaluate-claim");
      setActiveScenario(m.scenario ?? "");
      setQuery(m.dispute ?? "");
      setThread([{ question: m.dispute, answer: m.analysis as AskResponse }]);
      setPrepTab("Overview");
      setSavedMatter(m.title ?? "");
      setStatus("done");
      setError("");
    } catch {
      setError("Could not open that matter.");
      setStatus("error");
    }
  }

  async function removeMatter(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/matters/${id}`, { method: "DELETE", headers: authHeaders() });
      setMatters((prev) => prev.filter((m) => m.id !== id));
    } catch {
      /* best-effort */
    }
  }

  const casePrepView = (x: Exchange, idx: number) => {
    const a = x.answer!;
    const sections = splitSections(a.answer);
    const meter = a.authority_meter;
    const body = sections[prepTab] ?? "";
    return (
      <div key={idx} className="mt-6">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-medium text-[#8a8571] dark:text-neutral-400">{x.question}</span>
          <span className="rounded-full bg-[#efede3] px-2 py-0.5 text-[10px] text-[#6b6450] dark:bg-neutral-800 dark:text-neutral-400">
            {OBJECTIVES.find((o) => o.id === objective)?.label ?? "Evaluate the claim"}
          </span>
          {activeScenario && (
            <span
              title={activeScenario}
              className="max-w-[320px] truncate rounded-full border border-[#b05c3b] px-2 py-0.5 text-[10px] text-[#b05c3b]"
            >
              What if: {activeScenario}
            </span>
          )}
        </div>
        {verificationBanner(a)}
        {meter && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e1d5] bg-white px-4 py-2 text-xs dark:border-neutral-700 dark:bg-[#30302e]">
            <span className={`font-semibold ${meter.level === "strong" ? "text-[#1f6b45]" : meter.level === "moderate" ? "text-[#9a6b12]" : "text-[#b13333]"}`}>
              Authority support: {meter.level}
            </span>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-6 rounded-full"
                  style={{
                    background:
                      (meter.level === "strong" ? 3 : meter.level === "moderate" ? 2 : 1) > i
                        ? "#2f6b4f"
                        : "#e3e1d5",
                  }}
                />
              ))}
            </span>
            <span className="text-[#8a8571] dark:text-neutral-400">{meter.reasons.join(" · ")}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1 border-b border-[#e8e6dc] text-[13px] dark:border-neutral-800">
          {CASEPREP_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setPrepTab(tab)}
              className={`px-3.5 py-2 ${
                prepTab === tab
                  ? "border-b-2 border-[#1e3a5a] font-semibold text-[#1e3a5a] dark:text-blue-400"
                  : "text-[#8a8571] hover:text-[#5d5848] dark:text-neutral-400"
              }`}
            >
              {tab}
              {tab === "Missing facts" && (a.missing_sections ?? []).includes("Missing facts") === false && sections["Missing facts"] && sections["Missing facts"].trim().length > 30 ? " ⚑" : ""}
            </button>
          ))}
        </div>
        <article className="prose prose-sm mt-3 max-h-[58vh] max-w-none overflow-y-auto rounded-2xl border border-[#e3e1d5] bg-white p-6 [font-family:var(--font-serif)] dark:prose-invert dark:border-neutral-700 dark:bg-[#30302e]">
          <ReactMarkdown>{body || "This section was not produced for this dispute."}</ReactMarkdown>
        </article>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => copyAnswer(idx)}
            className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300"
          >
            {copiedIdx === idx ? "Copied ✓" : "Copy analysis"}
          </button>
          <button
            onClick={() => exportMemo(idx)}
            title="Export the full analysis as a Word document with the verification appendix"
            className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300"
          >
            Export record
          </button>
          {savedMatter ? (
            <span className="text-xs text-[#1f6b45] dark:text-emerald-400">Saved to &quot;{savedMatter}&quot; ✓</span>
          ) : (
            <button
              onClick={() => setShowSaveMatter((v) => !v)}
              className="rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300"
            >
              Save to matter
            </button>
          )}
          <span className="text-[11px] text-[#a39f8d] dark:text-neutral-500">
            Qualitative analysis; verify every authority before relying on it.
          </span>
        </div>
        {showSaveMatter && !savedMatter && (
          <div className="mt-3 rounded-2xl border border-[#e3e1d5] bg-white p-4 dark:border-neutral-700 dark:bg-[#30302e]">
            <div className="flex gap-2">
              <input
                value={matterTitle}
                onChange={(e) => setMatterTitle(e.target.value)}
                placeholder='Matter name, e.g. "Rodriguez deposit dispute"'
                className="flex-1 rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs outline-none placeholder:text-[#a39f8d] focus:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#262624]"
              />
              <button
                onClick={saveMatter}
                disabled={matterTitle.trim().length < 2}
                className="rounded-lg bg-[#1e3a5a] px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-[#8a8571] dark:text-neutral-400">
              Saving stores this analysis on our servers: the dispute, facts, scenario, and
              the result, under your account, until you delete it. Nothing else you do in
              Casewise is stored.
            </p>
          </div>
        )}
        <div className="mt-4 rounded-2xl border border-[#e3e1d5] bg-white p-4 dark:border-neutral-700 dark:bg-[#30302e]">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#a39f8d] dark:text-neutral-500">
            Explore scenarios
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {scenarioChips(sections).map((q) => (
              <button
                key={q}
                onClick={() => runScenario(`What if the answer to this is favorable to the client: ${q}`)}
                className="rounded-full border border-[#e3e1d5] bg-[#faf9f5] px-3 py-1.5 text-left text-xs text-[#5d5848] hover:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#262624] dark:text-neutral-300"
              >
                What if: {q}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <input
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Your own what-if, e.g. What if the seller disclosed the flooding in writing?"
              className="flex-1 rounded-lg border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs outline-none placeholder:text-[#a39f8d] focus:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
            />
            <button
              onClick={() => runScenario(scenario)}
              disabled={status === "loading" || scenario.trim().length < 10}
              className="rounded-lg bg-[#1e3a5a] px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Run scenario
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[#8a8571] dark:text-neutral-400">
            Each scenario re-runs the full analysis with that one fact stipulated, and the
            Overview opens with what it changes. Conditional reasoning with authorities,
            never a prediction.
          </p>
        </div>
      </div>
    );
  };

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
            <Link href="/app" title="Casewise home" onClick={(e) => { e.preventDefault(); goWorkspace("/app"); }} className="flex items-baseline gap-2 hover:opacity-80">
              <span className="text-xl font-semibold tracking-tight [font-family:var(--font-serif)]">
                Casewise
              </span>
              <span className="text-[10px] text-[#a39f8d] dark:text-neutral-500">V-2.14.1</span>
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
            onClick={() => {
              reset();
              goWorkspace("/app");
            }}
            className="mx-3 mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span className="text-base leading-none text-[#1e3a5a]">+</span> New research
          </button>
          <div className="mt-3 px-5 pb-1 text-[10px] uppercase tracking-[0.14em] text-[#bcb8a5] dark:text-neutral-600">
            Workspaces
          </div>
          <nav className="flex flex-col gap-0.5 px-3">
            {WORKSPACES.map((w) => (
              <Link
                key={w.slug}
                href={`/app/${w.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileNavOpen(false);
                  goWorkspace(`/app/${w.slug}`);
                }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  !isHub && wsSlug === w.slug
                    ? "bg-[#eae8dc] font-medium text-[#3d3929] dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <WsIcon name={w.icon} />
                  {w.label}
                </span>
                <span className="text-[11px] text-[#bcb8a5] dark:text-neutral-600">{w.hint}</span>
              </Link>
            ))}
          </nav>
          {authToken && matters.length > 0 && (
            <>
              <div className="mt-3 px-5 pb-1 text-[10px] uppercase tracking-[0.14em] text-[#bcb8a5] dark:text-neutral-600">
                Matters
              </div>
              <div className="flex flex-col gap-0.5 px-3">
                {matters.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openMatter(m.id)}
                    title={m.dispute}
                    className="group flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px] text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <span className="truncate">{m.title}</span>
                    <span
                      onClick={(e) => removeMatter(e, m.id)}
                      title="Delete this matter"
                      className="hidden pl-2 text-[#a39f8d] hover:text-[#b13333] group-hover:inline"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

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
              Questions stay in this browser. Nothing is stored on our servers unless you save it to a matter.
            </div>
          </div>
    </>
  );

  return (
    <div className="flex h-dvh bg-[#faf9f5] text-[#3d3929] dark:bg-[#262624] dark:text-neutral-200">
      {!sidebarOpen && (
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-[#e8e6dc] bg-[#f5f4ee] pt-4 dark:border-neutral-800 dark:bg-[#1f1e1b] md:flex">
          <button
            onClick={toggleSidebar}
            title="Show sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm text-[#a39f8d] hover:bg-[#eae8dc] hover:text-[#5d5848] dark:hover:bg-neutral-800"
          >
            »
          </button>
          <Link
            href="/app"
            title="Home"
            onClick={(e) => {
              e.preventDefault();
              goWorkspace("/app");
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              isHub ? "bg-[#eae8dc] text-[#3d3929] dark:bg-neutral-700" : "text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300"
            }`}
          >
            <WsIcon name="home" />
          </Link>
          {WORKSPACES.map((w) => (
            <Link
              key={w.slug}
              href={`/app/${w.slug}`}
              title={w.label}
              onClick={(e) => {
                e.preventDefault();
                goWorkspace(`/app/${w.slug}`);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                !isHub && wsSlug === w.slug
                  ? "bg-[#eae8dc] text-[#3d3929] dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-[#5d5848] hover:bg-[#eae8dc] dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <WsIcon name={w.icon} />
            </Link>
          ))}
        </aside>
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
            <span className="text-[10px] text-[#a39f8d] dark:text-neutral-500">V-2.14.1</span>
          </Link>
          <button
            onClick={() => setMobileNavOpen(true)}
            title="Menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5a] text-white"
          >
            ☰
          </button>
        </div>
        {isHub ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
            <div className="w-full max-w-3xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/owl/casewise-owl-256.webp" alt="" className="mx-auto mb-4 h-16 w-16" />
              <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#a39f8d] dark:text-neutral-500">
                New York legal research
              </p>
              <h1 className="mb-3 text-balance text-center text-3xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-4xl">
                What are you researching today?
              </h1>
              <p className="mb-7 text-center text-sm text-[#8a8571] dark:text-neutral-400">
                Pick a workspace, or just start with a question.
              </p>
              <Link
                href="/app/ask"
                onClick={(e) => {
                  e.preventDefault();
                  goWorkspace("/app/ask");
                }}
                className="flex items-center gap-3 rounded-2xl border border-[#e3e1d5] bg-white px-5 py-4 shadow-[0_2px_12px_rgba(61,57,41,0.06)] hover:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
              >
                <span className="flex-1 text-[15px] text-[#a39f8d]">
                  Ask a legal question, like &quot;Can a tenant withhold rent for repairs?&quot;
                </span>
                <span className="rounded-xl bg-[#1e3a5a] px-5 py-2 text-sm font-medium text-white">
                  Research
                </span>
              </Link>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { href: "/app/ask", bar: "#1e3a5a", title: "Ask", body: "Plain-English questions, answers cited and verified against NY sources." },
                  { href: "/app/search", bar: "#6b5b8a", title: "Search", body: "Semantic and exact-phrase search across statutes, decisions, guidance." },
                  { href: "/app/check", bar: "#2f6b4f", title: "Check cites", body: "Audit any brief against 5.1M official records. Yours or theirs." },
                  { href: "/app/draft", bar: "#a16d1f", title: "Draft IRAC", body: "Issue and facts in, a structured cited analysis out. Word export." },
                ].map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={(e) => {
                      e.preventDefault();
                      goWorkspace(c.href);
                    }}
                    className="flex flex-col gap-1.5 rounded-xl border border-[#e3e1d5] bg-white p-4 hover:border-[#1e3a5a] dark:border-neutral-700 dark:bg-[#30302e]"
                  >
                    <span className="h-[3px] w-8 rounded" style={{ background: c.bar }} />
                    <span className="text-sm font-semibold text-[#3d3929] dark:text-neutral-100">{c.title}</span>
                    <span className="text-xs leading-relaxed text-[#8a8571] dark:text-neutral-400">{c.body}</span>
                  </Link>
                ))}
                <Link
                  href="/app/case-prep"
                  onClick={(e) => {
                    e.preventDefault();
                    goWorkspace("/app/case-prep");
                  }}
                  className="flex flex-col gap-1.5 rounded-xl border-2 border-[#1e3a5a] bg-white p-4 dark:bg-[#30302e]"
                >
                  <span className="flex items-center justify-between">
                    <span className="h-[3px] w-8 rounded bg-[#b05c3b]" />
                    <span className="rounded-full bg-[#1e3a5a] px-2 py-0.5 text-[9px] uppercase tracking-wide text-white">new</span>
                  </span>
                  <span className="text-sm font-semibold text-[#3d3929] dark:text-neutral-100">Case Prep</span>
                  <span className="text-xs leading-relaxed text-[#8a8571] dark:text-neutral-400">Both sides of your dispute: arguments, weaknesses, missing facts, ruling paths.</span>
                </Link>
              </div>
              <p className="mt-6 text-center text-xs text-[#a39f8d] dark:text-neutral-500">
                SI research assistant for New York property law. For licensed attorneys;
                not legal advice. Verify all citations.
              </p>
              {isGuest && (
                <p className="mt-2 text-center text-xs text-[#8a8571] dark:text-neutral-400">
                  Guest preview: ask up to {GUEST_LIMIT} questions free, no sign-up.{" "}
                  <Link href="/signup" className="text-[#1e3a5a] hover:underline dark:text-blue-400">
                    Start your 7-day trial
                  </Link>{" "}
                  for search, cite checking, and memo export.
                </p>
              )}
            </div>
          </div>
        ) : !hasContent ? (
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/owl/casewise-owl-256.webp" alt="" className="mx-auto mb-4 h-16 w-16" />
              <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#a39f8d] dark:text-neutral-500">
                {mode === "ask" ? "Ask: cited answers" : mode === "search" ? "Search the sources" : mode === "audit" ? "Citation checker" : mode === "draft" ? "Draft IRAC" : "Case Prep"}
              </p>
              <h1 className="mb-3 text-balance text-center text-3xl leading-snug tracking-tight [font-family:var(--font-serif)] md:text-4xl">
                {mode === "ask"
                  ? "What are you researching today?"
                  : mode === "search"
                    ? "Search NY statutes, decisions, and guidance"
                    : mode === "audit"
                      ? "Check citations in a document"
                      : mode === "draft"
                        ? "Draft an IRAC analysis"
                        : "Prepare both sides of your dispute"}
              </h1>
              <p className="mb-7 text-center text-sm text-[#8a8571] dark:text-neutral-400">
                {mode === "ask"
                  ? "Plain-English questions, answered from the sources with verified citations."
                  : mode === "search"
                    ? 'Semantic search with relevance grading. Put "exact phrases" in quotes when the wording is the argument.'
                    : mode === "audit"
                      ? "Paste or upload a brief. Citations are checked against official records; quotes matched word for word."
                      : mode === "draft"
                        ? "Your issue and facts in, a structured Issue / Rule / Application / Conclusion draft out."
                        : "Arguments for you, the other side's best case, ruling paths, appeal exposure, and the facts you still need. Qualitative analysis; no win percentages."}
              </p>
              {inputCard}
              {mode === "draft" && (
                <div className="mt-4 grid gap-2 text-[11.5px] sm:grid-cols-4">
                  {[
                    ["I · Issue", "The question, framed with the decisive facts"],
                    ["R · Rule", "Statutes first, then cases; every proposition cited"],
                    ["A · Application", "Your facts mapped to each element, plus counteranalysis"],
                    ["C · Conclusion", "The likely outcome; nothing new introduced"],
                  ].map(([h, b]) => (
                    <div key={h} className="rounded-xl border border-[#e3e1d5] bg-white p-3 dark:border-neutral-700 dark:bg-[#30302e]">
                      <span className="font-semibold text-[#1e3a5a] dark:text-blue-400">{h}</span>
                      <div className="mt-1 leading-snug text-[#6b6450] dark:text-neutral-400">{b}</div>
                    </div>
                  ))}
                </div>
              )}
              {mode === "ask" && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-[#bcb8a5] dark:text-neutral-600">
                    Try a common question
                  </span>
                  {EXAMPLE_QUESTIONS.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => setQuery(ex.q)}
                      className="rounded-full border border-[#e3e1d5] bg-white px-3 py-1.5 text-xs text-[#5d5848] hover:bg-[#f5f4ee] dark:border-neutral-700 dark:bg-[#30302e] dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              )}
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
          <div className={`mx-auto px-4 py-8 ${((mode === "ask" || mode === "draft" || mode === "caseprep") && panelIdx >= 0) || mode === "audit" ? "max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8" : "max-w-3xl"}`}>
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

            {mode === "caseprep" &&
              thread.map((x, idx) =>
                x.answer
                  ? casePrepView(x, idx)
                  : answerCard(x, idx, status === "loading" && idx === thread.length - 1)
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
            {(((mode === "ask" || mode === "draft" || mode === "caseprep") && panelIdx >= 0 && thread[panelIdx]?.answer) || mode === "audit") && (
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

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-[#faf9f5] text-sm text-[#a39f8d] dark:bg-[#262624] dark:text-neutral-500">
          Opening Casewise…
        </div>
      }
    >
      <Home />
    </Suspense>
  );
}
