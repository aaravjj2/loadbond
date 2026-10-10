"""Locate a pasted quotation in extracted page text.

Stored evidence must equal page_text[start:end]. A reader copying from a PDF viewer
often gets text that differs from the extracted layer only in whitespace, line-break
hyphenation or typographic punctuation, so those differences are folded before
matching and the returned span always covers the page's own characters.
"""
import re

FOLD = str.maketrans({'\u2018': "'", '\u2019': "'", '\u201a': "'", '\u201b': "'", '\u2032': "'",
                      '\u201c': '"', '\u201d': '"', '\u201e': '"', '\u2033': '"',
                      '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
                      '\u00ad': None, '\ufffd': None})
LINE_BREAK_HYPHEN = re.compile(r'-[ \t]*\r?\n\s*')
MIN_FOLDED = 8


def fold(text: str) -> tuple[str, list[int]]:
    """Return text without whitespace, soft hyphens or line-break hyphens, plus each kept character's original index."""
    skip = set()
    for m in LINE_BREAK_HYPHEN.finditer(text):
        skip.update(range(m.start(), m.end()))
    out, index = [], []
    for i, ch in enumerate(text):
        if i in skip or ch.isspace():
            continue
        mapped = ch.translate(FOLD)
        if not mapped:
            continue
        out.append(mapped.lower())
        index.append(i)
    return ''.join(out), index


def spans(text: str, quote: str) -> tuple[list[tuple[int, int]], bool]:
    """Occurrences of quote in text as (start, end), and whether folding was needed."""
    exact = [(m.start(), m.end()) for m in re.finditer(re.escape(quote), text)]
    if exact:
        return exact, False
    needle, _ = fold(quote)
    if len(needle) < MIN_FOLDED:
        return [], False
    hay, index = fold(text)
    found, at = [], hay.find(needle)
    while at >= 0:
        found.append((index[at], index[at + len(needle) - 1] + 1))
        at = hay.find(needle, at + len(needle))
    return found, bool(found)
