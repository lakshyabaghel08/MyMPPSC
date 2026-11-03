#!/usr/bin/env python3
"""Stage the 2011 supplied PDF text, stopping before its answer key."""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'
PDF = DIR / 'MPPSC Prelims General Studies  Solved Question paper 2011.pdf'
TEXT = DIR / 'pdf-extracted-2011.txt'
OUT = DIR / 'pdf-transcription-2011.json'
QUESTION = re.compile(r'(?m)^(\d{1,3})\.\s+')
OPTION = re.compile(r'(?m)^\(([A-D])\)\s*')
FURNITURE = re.compile(r'^(?:# Page \d+|Page \d+|File hosted by educationobserver\.com/forum|MPPSC General Studies 2011|http://www\.developindiagroup\.co\.in/(?: Page \d+)?)$')


def main():
    raw = TEXT.read_bytes()
    parts = re.split(r'(?m)^\s*ANSWERS\s*$', raw.decode('utf8'), maxsplit=1)
    if len(parts) != 2:
        raise ValueError('Could not find answer section')
    text = '\n'.join(s for line in parts[0].splitlines() if (s := line.strip()) and not FURNITURE.fullmatch(s))
    matches = list(QUESTION.finditer(text))
    if [int(m.group(1)) for m in matches] != list(range(1,121)):
        raise ValueError('Question order is not 1–120')
    questions = []
    for i, m in enumerate(matches):
        block = text[m.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip()
        opts = list(OPTION.finditer(block))
        if [o.group(1) for o in opts] != list('ABCD'):
            raise ValueError(f'Q{i+1}: malformed options')
        question = block[:opts[0].start()].strip()
        choices = [{'key': o.group(1), 'text': block[o.end():opts[j+1].start() if j+1 < len(opts) else len(block)].strip()} for j,o in enumerate(opts)]
        if not question or any(not o['text'] for o in choices):
            raise ValueError(f'Q{i+1}: blank text')
        questions.append({'id': f'MPPSC-2011-{i+1:03}', 'question_number': i+1,
                          'language_variants': {'en': {'question_text': question, 'options': choices}}})
    output = {'status': 'PDF-derived staging; Q7 and Q38 contain damaged wording; individual review required',
              'source_pdf': PDF.relative_to(ROOT).as_posix(), 'source_pdf_sha256': hashlib.sha256(PDF.read_bytes()).hexdigest(),
              'extracted_text': TEXT.relative_to(ROOT).as_posix(), 'extracted_text_sha256': hashlib.sha256(raw).hexdigest(),
              'questions': questions}
    rendered = json.dumps(output, ensure_ascii=False, indent=2) + '\n'
    if sys.argv[1:] == ['--check']:
        if not OUT.exists() or OUT.read_text(encoding='utf8') != rendered:
            raise ValueError('2011 PDF transcription differs')
    elif not sys.argv[1:]:
        OUT.write_text(rendered, encoding='utf8')
    else:
        raise ValueError('usage: transcribe-2011-pdf.py [--check]')
    print('2011: 120 PDF-derived candidates staged; Q7 and Q38 need review')

if __name__ == '__main__':
    main()
