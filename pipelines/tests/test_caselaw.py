from datetime import date
from pathlib import Path

from casewise_pipelines.caselaw.decision import build_decision, extract_opinion_text
from casewise_pipelines.caselaw.feeds import parse_feed

FIXTURES = Path(__file__).parent / "fixtures" / "web"


def _refs():
    return parse_feed((FIXTURES / "misc_feed.xml").read_text(), feed_code="misc")


def test_parse_feed_counts_and_fields():
    refs = _refs()
    assert len(refs) > 100
    first = refs[0]
    assert first.case_name == "Go N.Y. Tours Inc. v New York State Dept. of Labor"
    assert first.url.endswith("/reporter/current/3dseries/2026/2026_26174.shtml")
    assert first.slip_citation == "2026 NY Slip Op 26174"
    assert first.court == "Supreme Court, New York County"
    assert first.decided_date == date(2026, 10, 1)
    assert first.feed_code == "misc"


def test_extract_opinion_text_from_real_page():
    html = (FIXTURES / "decision_26174.html").read_text()
    text = extract_opinion_text(html)
    assert text is not None
    assert text.startswith("[*1]")
    assert "CPLR" in text
    # masthead lines must not be in the opinion body
    assert "Decided on October 1, 2026" not in text


def test_build_decision_combines_ref_and_page():
    refs = _refs()
    html = (FIXTURES / "decision_26174.html").read_text()
    d = build_decision(refs[0], html)
    assert d is not None
    assert d.slip_citation == "2026 NY Slip Op 26174"
    assert d.decided_date == "2026-10-01"
    assert len(d.text) > 1000
