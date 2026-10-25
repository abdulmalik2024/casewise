from fastapi.testclient import TestClient

from casewise_api.caseprep import authority_meter, missing_sections
from casewise_api.main import app
from casewise_api.retrieval import SearchResult


def _src(citation: str, stype: str, date: str | None = None) -> SearchResult:
    return SearchResult(
        citation=citation, heading=None, text="x", source_type=stype,
        url=None, source_date=date, score=0.5,
    )


def test_authority_meter_strong():
    m = authority_meter([
        _src("RPP § 235-B", "statute"),
        _src("47 N.Y.2d 316", "case", "1979-05-08"),
        _src("203 A.D.3d 1591", "case", "2025-03-01"),
        _src("DHCR Fact Sheet #14", "guidance"),
    ])
    assert m.level == "strong"
    assert m.statute and m.court_of_appeals and m.appellate_decisions == 1
    assert m.recent and m.guidance == 1


def test_authority_meter_limited():
    m = authority_meter([_src("DHCR Fact Sheet #3", "guidance")])
    assert m.level == "limited"
    assert not m.statute and not m.court_of_appeals


def test_missing_sections():
    doc = "## Overview\nx\n\n## Supporting arguments\nx\n\n## Counterarguments\nx\n"
    missing = missing_sections(doc)
    assert "Ruling paths" in missing and "Missing facts" in missing
    assert "Overview" not in missing


def test_caseprep_requires_auth():
    with TestClient(app) as client:
        r = client.post(
            "/caseprep/stream",
            json={"dispute": "Deposit dispute over water damage", "facts": "x" * 80},
        )
        assert r.status_code in (401, 503)
