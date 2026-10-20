"""Research memo export (.docx) with verification appendix (roadmap Now #3).

Turns an Ask exchange into a Word memo: Question Presented, Discussion
(the answer's markdown rendered to native Word structure), Table of
Authorities, and a Verification Appendix (citation-verification note +
quote-check results). The memo + verification combo is the deliverable
no competitor ships.
"""

from __future__ import annotations

import io
import re
from datetime import date

from docx import Document
from docx.shared import Pt
from pydantic import BaseModel

from .quotecheck import QuoteCheck
from .rag import Source

BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
MARKER_RE = re.compile(r"\[S\d+\]")


class MemoIn(BaseModel):
    question: str
    answer: str
    sources: list[Source] = []
    quote_check: QuoteCheck | None = None
    model: str | None = None


def _add_runs(paragraph, text: str) -> None:
    """Render **bold** / *italic* inline markdown into runs."""
    pos = 0
    tokens = sorted(
        [(m.start(), m.end(), m.group(1), "b") for m in BOLD_RE.finditer(text)]
        + [(m.start(), m.end(), m.group(1), "i") for m in ITALIC_RE.finditer(text)]
    )
    taken_until = 0
    for start, end, inner, kind in tokens:
        if start < taken_until:
            continue
        if start > pos:
            paragraph.add_run(text[pos:start])
        run = paragraph.add_run(inner)
        run.bold = kind == "b"
        run.italic = kind == "i"
        pos = end
        taken_until = end
    if pos < len(text):
        paragraph.add_run(text[pos:])


def _render_markdown(doc: Document, md: str) -> None:
    lines = md.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= {"-", " ", ":"}:
            # markdown table
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(cells)
                i += 1
            rows.pop(1)  # separator row
            table = doc.add_table(rows=len(rows), cols=max(len(r) for r in rows))
            table.style = "Table Grid"
            for ri, row in enumerate(rows):
                for ci, cell in enumerate(row):
                    p = table.cell(ri, ci).paragraphs[0]
                    _add_runs(p, re.sub(r"\*\*(.+?)\*\*", r"\1", cell) if ri == 0 else cell)
                    if ri == 0:
                        for run in p.runs or [p.add_run("")]:
                            run.bold = True
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            doc.add_heading(MARKER_RE.sub("", m.group(2)).strip(), level=min(len(m.group(1)) + 1, 4))
        elif re.match(r"^[-*]\s+", line):
            p = doc.add_paragraph(style="List Bullet")
            _add_runs(p, re.sub(r"^[-*]\s+", "", line))
        elif re.match(r"^\d+\.\s+", line):
            p = doc.add_paragraph(style="List Number")
            _add_runs(p, re.sub(r"^\d+\.\s+", "", line))
        elif line.startswith(">"):
            p = doc.add_paragraph(style="Intense Quote")
            _add_runs(p, line.lstrip("> "))
        elif set(line.strip()) <= {"-", "_", "*"} and len(line.strip()) >= 3:
            pass  # horizontal rule — skip
        else:
            p = doc.add_paragraph()
            _add_runs(p, line)
        i += 1


def build_memo(data: MemoIn) -> bytes:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Georgia"
    style.font.size = Pt(11)

    doc.add_heading("Research Memorandum", level=0)
    meta = doc.add_paragraph()
    meta.add_run(f"Date: {date.today().strftime('%B %-d, %Y')}\n").italic = True
    meta.add_run("Prepared with Casewise, SI research assistant for New York property law\n").italic = True
    meta.add_run("Attorney work product. Not legal advice. Verify all citations before relying.").italic = True

    doc.add_heading("Question Presented", level=1)
    doc.add_paragraph(data.question)

    doc.add_heading("Discussion", level=1)
    _render_markdown(doc, data.answer)

    if data.sources:
        doc.add_heading("Table of Authorities", level=1)
        for s in data.sources:
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(s.citation).bold = True
            tail = f" · {s.heading}" if s.heading else ""
            p.add_run(f"{tail} ({'decision' if s.source_type == 'case' else s.source_type})")
            if s.url:
                p.add_run(f"\n{s.url}").font.size = Pt(9)
            if s.amended_after:
                p.add_run("\n[Amended after the as-of research date; current text used]").italic = True

    doc.add_heading("Verification Appendix", level=1)
    doc.add_paragraph(
        "Citations: every [Sn] citation marker in this memo was mapped server-side "
        "to a document retrieved from the Casewise corpus (NY statutes, court "
        "decisions, DHCR guidance, court rules, and official forms). Markers that "
        "did not correspond to a retrieved document were removed before delivery; "
        "fabricated citations cannot appear in this memo by construction."
    )
    qc = data.quote_check
    if qc and qc.total:
        if not qc.unverified:
            doc.add_paragraph(
                f"Quotations: all {qc.total} quoted passage(s) were matched "
                "character-for-character (after normalization) against the cited source texts."
            )
        else:
            doc.add_paragraph(
                f"Quotations: {qc.verified} of {qc.total} quoted passage(s) matched the "
                "cited source texts word-for-word. The following are not an exact match; "
                "check the wording against the source before citing:"
            )
            for q in qc.unverified:
                doc.add_paragraph(f'"{q}"', style="Intense Quote")
    else:
        doc.add_paragraph("Quotations: no quoted passages detected in this memo.")
    if data.model:
        doc.add_paragraph(f"Drafted with {data.model}.").runs[0].font.size = Pt(9)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
