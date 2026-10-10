"""Cut the pages naming competing proposers out of PJM's 2024 RTEP Window 1 Constructability &
Financial Analysis Final Report (213 pages, 7 MB), and record where they came from.

Download the source first:
  curl.exe -L -o cfa.pdf https://www.pjm.com/-/media/DotCom/committees-groups/committees/teac/2025/20250107/20250107-2024-rtep-window-1-constructability--financial-analysis.pdf
then run:  python samples/public-dea/make_proposals_excerpt.py cfa.pdf
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
SOURCE_URL = 'https://www.pjm.com/-/media/DotCom/committees-groups/committees/teac/2025/20250107/20250107-2024-rtep-window-1-constructability--financial-analysis.pdf'
PAGES = {1: None, 9: 'The scenario proposals were proposed by', 185: 'NextEra Proposal 533 includes the following components',
         204: 'is the best performing ATSI zone proposal'}
OUT = HERE / 'pjm-2024w1-proposals-excerpt.pdf'


def main(source: Path) -> None:
    reader = PdfReader(source)
    writer = PdfWriter()
    for n, needle in PAGES.items():
        text = ' '.join((reader.pages[n - 1].extract_text() or '').split())
        if needle and needle not in text:
            raise SystemExit(f'Page {n} no longer contains {needle!r}; locate it again')
        writer.add_page(reader.pages[n - 1])
    with OUT.open('wb') as f:
        writer.write(f)
    provenance = {
        'source_url': SOURCE_URL,
        'source_title': 'PJM 2024 RTEP Window 1 Constructability & Financial Analysis Final Report (TEAC, January 7, 2025)',
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'source_pages': len(reader.pages),
        'excerpt_pages': list(PAGES),
        'excerpt_sha256': hashlib.sha256(OUT.read_bytes()).hexdigest(),
        'retrieved_on': date.today().isoformat(),
        'used_for': 'Whether a Nonincumbent Developer submitted a competing proposal for the needs addressed by the '
                    'Potomac Edison (regional cluster) and ATSI (ATSI cluster) projects, under DEA Section 3.0.',
    }
    (HERE / 'pjm-2024w1-proposals-excerpt.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(provenance, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
