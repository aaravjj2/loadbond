"""Checks that clean quotations pasted from a PDF viewer locate in the Chestnut filing's extracted text."""
import re
import sys
from pathlib import Path

import pypdf

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend import evidence_match  # noqa: E402

PDF = Path(__file__).with_name('pjm-sa4704-chestnut-solar-isa.pdf')
CASES = [
    (14, 'Transmission Provider as beneficiary (\u201cSecurity\u201d) in the amount of $2,111,149.'),
    (14, '11.2.1 Adjustments to Security'),
    (25, '$2,111,149 Total Security required with ISA'),
]


def main() -> None:
    pages = [p.extract_text() or '' for p in pypdf.PdfReader(PDF).pages]
    for page, quote in CASES:
        found, normalized = evidence_match.spans(pages[page - 1], quote)
        print(page, 'normalized' if normalized else 'exact', [pages[page - 1][a:b] for a, b in found] or 'NOT FOUND')
    split = [(n, t) for n, t in enumerate(pages, 1) if re.search(r'\w \w{2,}', t) and 'bene fit' in t]
    for n, text in split[:3]:
        at = text.find('bene fit')
        pasted = re.sub(r'\s+', ' ', text[max(0, at - 50):at + 60]).replace('bene fit', 'benefit').strip()
        found, normalized = evidence_match.spans(text, pasted)
        print(n, 'normalized' if normalized else 'exact', 'found' if found else 'NOT FOUND', repr(pasted))


if __name__ == '__main__':
    main()
