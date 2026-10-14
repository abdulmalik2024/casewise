from casewise_api.audit import REPORTER_RE, SLIP_RE, extract_statute_cites

BRIEF = """
Petitioner relies on RPAPL § 711 and Real Property Law § 235-b, as well as
CPLR 3211 and General Obligations Law § 7-108. See also 22 NYCRR § 208.42,
Matter of Smith v Jones, 230 AD3d 1145, and 2026 NY Slip Op 51586(U).
RPAPL § 711 is cited twice but should appear once.
"""


def test_statute_extraction_and_mapping():
    cites = extract_statute_cites(BRIEF)
    pairs = {(law, loc) for _, law, loc in cites}
    assert ("RPA", "711") in pairs
    assert ("RPP", "235-B") in pairs
    assert ("CVP", "3211") in pairs
    assert ("GOB", "7-108") in pairs
    # deduped
    assert sum(1 for _, law, loc in cites if (law, loc) == ("RPA", "711")) == 1


def test_slip_op_and_reporter_patterns():
    assert SLIP_RE.search(BRIEF).group(0).startswith("2026 NY Slip Op 51586")
    assert REPORTER_RE.search(BRIEF).group(0) == "230 AD3d 1145"
