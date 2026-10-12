"""Split corpus documents into embeddable chunks.

Statute sections are usually small enough to embed whole — splitting only
kicks in past MAX_CHARS, on paragraph boundaries, so every chunk stays
independently citable under its section citation. Case decisions are long
and almost always split.
"""

from __future__ import annotations

MAX_CHARS = 6000  # ~1500 tokens
MIN_TAIL = 500  # merge a tiny trailing chunk into its predecessor


def chunk_text(text: str, max_chars: int = MAX_CHARS) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text] if text else []

    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for p in paragraphs:
        # a single oversized paragraph is split hard
        while len(p) > max_chars:
            head, p = p[:max_chars], p[max_chars:]
            if current:
                chunks.append("\n".join(current))
                current, size = [], 0
            chunks.append(head)
        if size + len(p) + 1 > max_chars and current:
            chunks.append("\n".join(current))
            current, size = [], 0
        current.append(p)
        size += len(p) + 1
    if current:
        chunks.append("\n".join(current))

    if len(chunks) >= 2 and len(chunks[-1]) < MIN_TAIL:
        chunks[-2] = chunks[-2] + "\n" + chunks[-1]
        chunks.pop()
    return chunks
