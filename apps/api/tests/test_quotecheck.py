from casewise_api.quotecheck import check_quotes, extract_quotes

SOURCE = """§ 235-b. Warranty of habitability. 1. In every written or oral lease
or rental agreement for residential premises the landlord or lessor shall
be deemed to covenant and warrant that the premises so leased or rented
and all areas used in connection therewith are fit for human habitation."""


def test_verified_exact_quote():
    answer = 'The statute provides that premises must be "fit for human habitation" under the warranty.'
    r = check_quotes(answer, [SOURCE])
    assert r.total == 1 and r.verified == 1 and r.unverified == []


def test_normalization_survives_punctuation_and_case():
    answer = 'It covers "every written, or ORAL lease — or rental agreement" in New York.'
    r = check_quotes(answer, [SOURCE])
    assert r.verified == 1


def test_ellipsis_requires_all_segments():
    good = 'The landlord "shall be deemed to covenant ... fit for human habitation".'
    bad = 'The landlord "shall be deemed to covenant ... fit for luxury accommodation".'
    assert check_quotes(good, [SOURCE]).verified == 1
    assert check_quotes(bad, [SOURCE]).unverified != []


def test_fabricated_quote_flagged():
    answer = 'The court held "tenants may always withhold rent without notice whatsoever".'
    r = check_quotes(answer, [SOURCE])
    assert r.verified == 0 and len(r.unverified) == 1


def test_short_quotes_ignored():
    assert extract_quotes('He said "yes" and left.') == []
