#!/usr/bin/env python3
"""Extract supplied 2009–2011 PDFs to auditable text (requires PyMuPDF 2.1).

The source PDF bytes are never changed. The output includes answer sections as
source evidence only; the transcription scripts discard answers.
"""
import sys
from pathlib import Path
try:
    import pymupdf
except ImportError as exc:
    raise SystemExit('Install PyMuPDF 2.1 to regenerate the PDF text: pip install PyMuPDF==2.1') from exc

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'
for year in (2009, 2010, 2011):
    paths = list(DIR.glob(f'*paper {year}.pdf'))
    if len(paths) != 1:
        raise ValueError(f'Expected exactly one {year} PDF')
    with pymupdf.open(paths[0]) as doc:
        page_count = len(doc)
        text = ''.join(f'# Page {i+1}\n' + page.get_text() + '\n' for i, page in enumerate(doc))
    output = DIR / f'pdf-extracted-{year}.txt'
    if sys.argv[1:] == ['--check']:
        if not output.exists() or output.read_text(encoding='utf8') != text:
            raise ValueError(f'{year}: extracted text differs; use the pinned PyMuPDF version')
    elif not sys.argv[1:]:
        output.write_text(text, encoding='utf8')
    else:
        raise ValueError('usage: extract-solved-pdf-text.py [--check]')
    print(f'{year}: {page_count} pages')
