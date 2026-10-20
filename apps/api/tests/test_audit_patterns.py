from casewise_api.audit import LAW_PATTERNS


def _extract(text: str) -> set[tuple[str, str]]:
    out = set()
    for pattern, law_id in LAW_PATTERNS:
        for m in pattern.finditer(text):
            out.add((law_id, m.group(1).upper()))
    return out


def test_new_law_patterns():
    text = (
        "Under Banking Law § 595-a and General Business Law § 352-c, see also "
        "UCC 2-A-515 and UCC § 9-611, Business Corporation Law § 624, "
        "N-PCL § 611, Lien Law § 9, and ETPA § 10."
    )
    got = _extract(text)
    assert ("BNK", "595-A") in got
    assert ("GBS", "352-C") in got
    assert ("UCC", "2-A-515") in got
    assert ("UCC", "9-611") in got
    assert ("BSC", "624") in got
    assert ("NPC", "611") in got
    assert ("LIE", "9") in got
    assert ("ETP", "10") in got


def test_original_patterns_still_match():
    got = _extract("RPAPL § 711 and RPL § 235-b, CPLR 408, GOL § 7-108, MDL § 302")
    assert ("RPA", "711") in got and ("RPP", "235-B") in got
    assert ("CVP", "408") in got and ("GOB", "7-108") in got and ("MDW", "302") in got
