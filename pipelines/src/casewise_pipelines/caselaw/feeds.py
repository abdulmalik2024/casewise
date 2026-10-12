"""Parse the NY Official Reports slip-opinion RSS feeds.

Feeds: https://www.nycourts.gov/reporter/RSS/{code}.xml (see data-sources.md).
Each item: case title, link to the decision page, and a description table
carrying decided date, slip citation, and court.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime

FEEDS = {
    "COA": "Court of Appeals",
    "AD1st": "Appellate Division, First Department",
    "AD2d": "Appellate Division, Second Department",
    "AD3d": "Appellate Division, Third Department",
    "AD4th": "Appellate Division, Fourth Department",
    "AT1": "Appellate Term, First Department",
    "AT2": "Appellate Term, Second Department",
    "misc": "Selected Trial Courts",
    "ComDiv": "Commercial Division",
}

FEED_URL = "https://www.nycourts.gov/reporter/RSS/{code}.xml"


@dataclass(frozen=True)
class DecisionRef:
    case_name: str
    url: str
    slip_citation: str | None
    court: str | None
    decided_date: date | None
    feed_code: str


def _parse_decided(description: str) -> date | None:
    m = re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4})", description)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%B %d, %Y").date()
    except ValueError:
        return None


def _parse_slip(description: str) -> str | None:
    m = re.search(r"(\d{4} NY Slip Op \d+(?:\(U\))?)", description)
    return m.group(1) if m else None


def _parse_court(description: str) -> str | None:
    m = re.search(r"Slip Op \d+(?:\(U\))?\s*(?:<br\s*/?>)?\s*([^<]+)", description)
    if not m:
        return None
    court = re.sub(r"\s+", " ", m.group(1)).strip()
    return court or None


def parse_feed(xml_text: str, feed_code: str) -> list[DecisionRef]:
    root = ET.fromstring(xml_text)
    refs = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = item.findtext("description") or ""
        if not title or not link:
            continue
        refs.append(
            DecisionRef(
                case_name=re.sub(r"\s+", " ", title),
                url=link,
                slip_citation=_parse_slip(description),
                court=_parse_court(description),
                decided_date=_parse_decided(description),
                feed_code=feed_code,
            )
        )
    return refs
