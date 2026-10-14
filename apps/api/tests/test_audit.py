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


# real answer text from a user test (V-2.2.0): Misc 2d + punctuation variants
ANSWER_TEXT = """See Park West Mgt. Corp. v. Mitchell, 47 N.Y.2d 316, 327 (N.Y. 1979).
See Edgemont Corp. v. Audet, 170 Misc. 2d 1040 (N.Y. App. Term, 1996).
See also Committed Community Associates v. Croswell, 171 Misc.2d 340
(N.Y. App. Term, 1997) aff'd 250 AD2d 845 (2nd Dep't, 1998);
Committed Community Assocs v Croswell, 171 Misc. 2d 340 aff'd 250 A.D.2d 845."""


def test_misc2d_matched_and_variants_deduped():
    from casewise_api.audit import _norm_cite

    found = {_norm_cite(m.group(0)) for m in REPORTER_RE.finditer(ANSWER_TEXT)}
    assert _norm_cite("47 N.Y.2d 316") in found
    assert _norm_cite("170 Misc. 2d 1040") in found
    assert _norm_cite("171 Misc.2d 340") in found
    # "250 AD2d 845" and "250 A.D.2d 845" normalize to one citation
    assert _norm_cite("250 AD2d 845") == _norm_cite("250 A.D.2d 845")
    assert len(found) == 4
