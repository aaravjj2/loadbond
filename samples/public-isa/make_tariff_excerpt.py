"""Cut PJM Tariff section 212.4 out of the consolidated PJM OATT PDF.

The consolidated tariff is about 146 MB and 6,606 pages, beyond the upload limit, so the trial
loads only the pages of section 212.4 and records where they came from. Download the source first:
  curl.exe -L -o oatt.pdf https://www.pjm.com/directory/merged-tariffs/oatt.pdf
then run:  python samples/public-isa/make_tariff_excerpt.py oatt.pdf
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
SOURCE_URL = 'https://www.pjm.com/pjmfiles/directory/merged-tariffs/oatt.pdf'
PAGES = range(553, 556)
OUT = HERE / 'pjm-oatt-212.4-excerpt.pdf'


def main(source: Path) -> None:
    reader = PdfReader(source)
    heading = reader.pages[PAGES[0] - 1].extract_text() or ''
    if '212.4 Retaining Priority and Security' not in heading:
        raise SystemExit('Section 212.4 is no longer on page %d of this tariff edition; locate it again' % PAGES[0])
    writer = PdfWriter()
    for n in PAGES:
        writer.add_page(reader.pages[n - 1])
    with OUT.open('wb') as f:
        writer.write(f)
    provenance = {
        'source_url': SOURCE_URL,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'source_pages': len(reader.pages),
        'excerpt_pages': list(PAGES),
        'excerpt_sha256': hashlib.sha256(OUT.read_bytes()).hexdigest(),
        'section': 'OATT Part VI, Subpart B, section 212.4 Retaining Priority and Security',
        'version_effective': '2020-04-01 (Docket ER19-1958-000), as printed in the page header',
        'retrieved_on': date.today().isoformat(),
        'governs_chestnut': 'Not established. The Chestnut ISA took effect 2017-05-03; this text took effect later.',
    }
    (HERE / 'pjm-oatt-212.4-excerpt.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(provenance, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
