"""Extract the opinion from an Official Reports decision page."""

from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup

from .feeds import DecisionRef


@dataclass(frozen=True)
class Decision:
    case_name: str
    url: str
    slip_citation: str | None
    court: str | None
    decided_date: str | None  # ISO
    feed_code: str
    text: str


def extract_opinion_text(html: str) -> str | None:
    """Decision pages put header paragraphs first; the opinion body starts at
    the first slip-opinion page marker ([*1]). Everything before it is masthead."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav"]):
        tag.decompose()
    body = soup.body
    if body is None:
        return None
    text = body.get_text("\n")
    marker = text.find("[*1]")
    if marker != -1:
        text = text[marker:]
    lines = [ln.strip() for ln in text.split("\n")]
    text = "\n".join(ln for ln in lines if ln)
    # trailing boilerplate
    for footer in ("Return to Decision List",):
        idx = text.rfind(footer)
        if idx != -1:
            text = text[:idx]
    text = text.strip()
    return text or None


def build_decision(ref: DecisionRef, html: str) -> Decision | None:
    text = extract_opinion_text(html)
    if not text:
        return None
    return Decision(
        case_name=ref.case_name,
        url=ref.url,
        slip_citation=ref.slip_citation,
        court=ref.court,
        decided_date=ref.decided_date.isoformat() if ref.decided_date else None,
        feed_code=ref.feed_code,
        text=text,
    )
