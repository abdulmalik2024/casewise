from casewise_api.anchors import _words_to_section, anchor_citations, xref_citations


def test_words_to_section():
    assert _words_to_section("two hundred twenty-six-c") == "226-C"
    assert _words_to_section("two hundred thirty-five-b") == "235-B"
    assert _words_to_section("seven hundred eleven") == "711"
    assert _words_to_section("226-c") == "226-C"
    assert _words_to_section("fifty") == "50"
    assert _words_to_section("gibberish words") is None


def test_anchor_citations():
    assert "RPP § 235-B" in anchor_citations("Can a tenant withhold rent for repairs?")
    assert "RPP § 232-A" in anchor_citations(
        "What notice before a holdover proceeding against a month-to-month tenant?"
    )
    assert "GOB § 7-108" in anchor_citations("How fast must a security deposit be returned?")
    assert anchor_citations("What is the statute of limitations for breach of contract?") == []


def test_xref_citations():
    text = (
        "unless pursuant to the notice period required by subdivision two of "
        "section two hundred twenty-six-c of this article, or for a tenancy"
    )
    assert xref_citations("RPP § 232-A", text) == ["RPP § 226-C"]
    # self-references and other-law text are ignored
    assert xref_citations("RPP § 226-C", "section two hundred twenty-six-c of this article") == []
