from casewise_pipelines.courtrules.run import split_part_sections

SAMPLE = """Part 208 Rules
Section 208.1 Application of Part; waiver; definitions
(a) Application. This Part shall be applicable to all actions.
(b) Waiver. For good cause shown as in section 208.42(i) of these rules.
Section 208.42 Housing Part of the Civil Court
(a) Application. This section governs the housing part.
More text here that is long enough to pass the length check for bodies.
Section 208.43 Something else entirely with a heading
Body of the next section follows here and is long enough as well to count.
"""


def test_split_part_sections():
    sections = split_part_sections(SAMPLE, "208")
    nums = [s[0] for s in sections]
    assert nums == ["208.1", "208.42", "208.43"]
    assert sections[0][1].startswith("Application of Part")
    assert "housing part" in sections[1][2]


def test_other_part_numbers_ignored():
    assert split_part_sections(SAMPLE, "212") == []
