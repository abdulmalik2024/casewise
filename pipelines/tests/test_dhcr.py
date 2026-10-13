from casewise_pipelines.dhcr.run import citation_for, doc_type_of, is_english


def test_doc_type_detection():
    assert doc_type_of("operational-bulletin-2024-1") == "operational-bulletin"
    assert doc_type_of("fact-sheet-26") == "fact-sheet"
    assert doc_type_of("policy-statement-91-5") == "policy-statement"
    assert doc_type_of("rsc-rule-text") == "regulation-amendments"
    assert doc_type_of("rent-laws-overview") is None


def test_language_filter():
    assert is_english("fact-sheet-26")
    assert not is_english("fact-sheet-26-spanish")
    assert not is_english("chinese-zhengceshengming-91-5")


def test_citations():
    assert citation_for("operational-bulletin-2024-1", "operational-bulletin") == "DHCR Operational Bulletin 2024-1"
    assert citation_for("fact-sheet-26", "fact-sheet") == "DHCR Fact Sheet #26"
    assert citation_for("policy-statement-91-5", "policy-statement") == "DHCR Policy Statement 91-5"
    assert (
        citation_for("advisory-opinion-87-3-postponed-provisions-rent-stabilization", "advisory-opinion")
        == "DHCR Advisory Opinion 87-3"
    )
