from casewise_pipelines.caselaw.backfill import best_text, slip_citation_of


def test_slip_citation_prefers_slip_op():
    cluster = {
        "citations": [
            {"volume": 230, "reporter": "AD3d", "page": "1145"},
            {"volume": 2024, "reporter": "NY Slip Op", "page": "01234"},
        ]
    }
    assert slip_citation_of(cluster) == "2024 NY Slip Op 01234"


def test_slip_citation_falls_back_to_any_reporter():
    cluster = {"citations": [{"volume": 230, "reporter": "AD3d", "page": "1145"}]}
    assert slip_citation_of(cluster) == "230 AD3d 1145"
    assert slip_citation_of({"citations": []}) is None


def test_best_text_prefers_plain_and_strips_html():
    assert best_text({"plain_text": "the opinion"}) == "the opinion"
    assert best_text({"plain_text": "", "html": "<p>op <b>text</b></p>"}) == "op text"
    assert best_text({"plain_text": ""}) is None
