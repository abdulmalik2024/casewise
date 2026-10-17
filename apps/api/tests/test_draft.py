from fastapi.testclient import TestClient

from casewise_api.draft import irac_lint
from casewise_api.main import app

CLEAN = """## Issue
Whether the tenant may withhold rent for the heat outage.

## Rule
Under RPL 235-b, every residential lease carries an implied warranty of habitability, \
and courts measure abatements by the severity and duration of the condition [S1][S2].

## Application
Because the apartment had no heat for three weeks in January, the warranty was \
breached [S1]. Like the tenant in the cited decision, the condition affected the \
whole unit [S2].

## Conclusion
A partial abatement is likely.

DRAFT — attorney work product for review.
"""

FLAWED = """## Issue
Whether the deposit must be returned.

## Rule
The landlord must return the security deposit within fourteen days of the tenant \
vacating, and an itemized statement is required when any portion is withheld.

## Application
Here the landlord kept the deposit without a statement, which violates the rule \
[S3]. [FACT NEEDED: the date the tenant vacated]
"""


def test_lint_passes_clean_irac():
    c = irac_lint(CLEAN)
    assert c.passed
    assert c.missing_sections == []
    assert c.uncited_rule_paragraphs == 0
    assert c.markers_only_in_application == []
    assert c.fact_gaps == []


def test_lint_flags_defects():
    c = irac_lint(FLAWED)
    assert not c.passed
    assert c.missing_sections == ["Conclusion"]
    assert c.uncited_rule_paragraphs == 1
    assert c.markers_only_in_application == ["S3"]
    assert c.fact_gaps == ["the date the tenant vacated"]


def test_draft_requires_auth():
    with TestClient(app) as client:
        r = client.post(
            "/draft/stream",
            json={"issue": "Can the tenant withhold rent?", "facts": "x" * 80},
        )
        assert r.status_code in (401, 503)
