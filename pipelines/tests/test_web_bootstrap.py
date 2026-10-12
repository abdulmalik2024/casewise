from pathlib import Path

from casewise_pipelines.statutes.web_bootstrap import parse_listing, parse_section_page

FIXTURES = Path(__file__).parent / "fixtures" / "web"


def test_parse_listing_extracts_section_links():
    items = parse_listing((FIXTURES / "rpp_a7_listing.html").read_text())
    labels = dict(items)
    assert "SECTION 227" in labels
    assert labels["SECTION 227"].endswith("/legislation/laws/RPP/227")
    assert "SECTION 235-B" in labels
    # every item is a section on an article page
    assert all(label.startswith("SECTION") for label in labels)
    assert len(items) > 30


def test_parse_section_page_real_markup():
    s = parse_section_page(
        (FIXTURES / "rpp_227_section.html").read_text(),
        law_id="RPP",
        location_id="227",
        crawl_date="2026-10-12",
    )
    assert s is not None
    assert s.citation == "RPP § 227"
    assert s.heading == "When tenant may surrender premises"
    assert s.active_date == "2014-09-22"  # from the history dropdown, not the crawl date
    assert "untenantable" in s.text
    assert s.article_path == "ARTICLE 7 — Landlord and Tenant"
    assert s.source == "nysenate_web"
    assert s.source_url == "https://www.nysenate.gov/legislation/laws/RPP/227"


def test_parse_section_page_without_text_returns_none():
    assert (
        parse_section_page("<html><body>no statute here</body></html>", "RPP", "1", "2026-10-12")
        is None
    )
