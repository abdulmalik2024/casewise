from casewise_pipelines.embeddings.chunker import chunk_text


def test_short_text_is_one_chunk():
    assert chunk_text("short section text") == ["short section text"]


def test_empty_text_yields_nothing():
    assert chunk_text("   ") == []


def test_long_text_splits_on_paragraphs():
    paragraphs = [f"paragraph {i} " + "x" * 500 for i in range(30)]
    chunks = chunk_text("\n".join(paragraphs), max_chars=2000)
    assert len(chunks) > 1
    assert all(len(c) <= 2000 + 501 for c in chunks)  # +tail merge allowance
    # nothing lost
    assert sum(c.count("paragraph") for c in chunks) == 30


def test_oversized_single_paragraph_hard_splits():
    chunks = chunk_text("y" * 15000, max_chars=6000)
    assert len(chunks) == 3
    assert sum(len(c) for c in chunks) == 15000
