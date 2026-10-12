"""Parse an Open Legislation law tree into section-level documents.

The API returns a law as a nested tree (CHAPTER > ARTICLE > ... > SECTION).
We flatten it to SECTION nodes, keeping the ancestor path so every chunk
carries its article context (e.g. "A7 — Landlord and Tenant").
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StatuteSection:
    law_id: str
    location_id: str
    citation: str
    heading: str | None
    article_path: str
    text: str
    active_date: str
    source_url: str
    source: str = "openleg_api"


def _source_url(law_id: str, location_id: str) -> str:
    return f"https://www.nysenate.gov/legislation/laws/{law_id}/{location_id}"


def parse_law_tree(result: dict) -> list[StatuteSection]:
    """Flatten a `GET /laws/{lawId}?full=true` result into sections."""
    law_id = result["info"]["lawId"]
    root = result["documents"]
    sections: list[StatuteSection] = []
    _walk(root, law_id, ancestors=[], out=sections)
    return sections


def _walk(node: dict, law_id: str, ancestors: list[str], out: list[StatuteSection]) -> None:
    doc_type = node.get("docType", "")
    title = (node.get("title") or "").strip()

    if doc_type == "SECTION":
        text = (node.get("text") or "").strip()
        if text:
            location_id = node["locationId"]
            out.append(
                StatuteSection(
                    law_id=law_id,
                    location_id=location_id,
                    citation=f"{law_id} § {location_id}",
                    heading=title or None,
                    article_path=" > ".join(ancestors),
                    text=text,
                    active_date=node["activeDate"],
                    source_url=_source_url(law_id, location_id),
                )
            )
        return

    label = f"{node.get('locationId', '')} — {title}".strip(" —") if title else node.get("locationId", "")
    next_ancestors = ancestors + [label] if label and doc_type != "CHAPTER" else ancestors
    children = (node.get("documents") or {}).get("items") or []
    for child in children:
        _walk(child, law_id, next_ancestors, out)
