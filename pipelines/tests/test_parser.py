import json
from pathlib import Path

from casewise_pipelines.statutes.parser import parse_law_tree

FIXTURE = Path(__file__).parent / "fixtures" / "rpp_sample.json"


def _sections():
    return parse_law_tree(json.loads(FIXTURE.read_text()))


def test_extracts_only_sections_with_text():
    sections = _sections()
    # 226-C has empty text and must be skipped
    assert [s.location_id for s in sections] == ["227", "235-B"]


def test_citation_format():
    sections = _sections()
    assert sections[0].citation == "RPP § 227"
    assert sections[1].citation == "RPP § 235-B"


def test_article_path_includes_article_not_chapter():
    s = _sections()[0]
    assert s.article_path == "A7 — LANDLORD AND TENANT"


def test_version_metadata_and_source_url():
    s227, s235b = _sections()
    assert s227.active_date == "2014-09-22"
    assert s235b.active_date == "2019-06-14"
    assert s235b.heading == "Warranty of habitability"
    assert s227.source_url == "https://www.nysenate.gov/legislation/laws/RPP/227"
