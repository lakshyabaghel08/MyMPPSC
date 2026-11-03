#!/usr/bin/env python3
"""Stage recoverable questions from the text extracted from the supplied PDFs.

The extracted text is retained alongside the original PDFs. Answer lines only
mark boundaries; answers are never imported. Missing diagrams and the damaged
table are excluded rather than reconstructed.
"""
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'
spec = importlib.util.spec_from_file_location('old_transcriber', ROOT / 'tools/transcribe-2009-2010.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)


def extract(year):
    pdf = DIR / old.SOURCES[year].replace('.md', '.pdf')
    text_file = DIR / f'pdf-extracted-{year}.txt'
    text = text_file.read_text(encoding='utf8')
    shared = {}
    if year == 2009:
        ar = text.split('Directions—(Q. 101 to 110)', 1)[1].split('101. Assertion', 1)[0]
        matches = list(old.OPTION.finditer(ar))
        if [m.group(1) for m in matches] != list('ABCD'):
            raise ValueError('shared assertion/reason options malformed')
        choices = [{'key': m.group(1), 'text': old.clean(ar[m.end():matches[i+1].start() if i+1 < len(matches) else len(ar)])} for i,m in enumerate(matches)]
        instructions = 'Directions—(Q. 101 to 110)' + old.clean(ar[:matches[0].start()])
        for n in range(101, 111):
            shared[n] = (instructions, choices)
        directions = text.split('Directions—Based on the following information, answer the question 82 to 85', 1)[1].split('82. What is', 1)[0]
        instructions = 'Directions—Based on the following information, answer the question 82 to 85' + old.clean(directions)
        for n in range(82, 86):
            shared[n] = (instructions, None)
    questions, excluded, last, start = [], [], 0, 0
    for answer in old.ANSWER.finditer(text):
        block = text[start:answer.start()]
        start = answer.end()
        candidates = [m for m in old.NUMBER.finditer(block) if last < int(m.group(1)) <= 150]
        if not candidates:
            continue
        match = candidates[0]
        n = int(match.group(1)); last = n
        body = old.clean(block[match.end(1):].lstrip('. '))
        options = list(old.OPTION.finditer(body))
        shared_choices = shared.get(n, (None, None))[1]
        if shared_choices:
            stem, choices = body, shared_choices
        else:
            stem = body[:options[0].start()].strip() if options else body
            choices = [{'key': m.group(1), 'text': body[m.end():options[i+1].start() if i+1 < len(options) else len(body)].strip()} for i,m in enumerate(options)]
        if year == 2009 and n in (75, 76, 77, 78):
            excluded.append({'question_number': n, 'reason': 'diagram missing' if n == 75 else 'shared table layout damaged in PDF'})
            continue
        if not stem or [o['key'] for o in choices] != list('ABCD') or any(not o['text'] for o in choices):
            raise ValueError(f'{year} Q{n}: missing/malformed question or options')
        variant = {'question_text': stem, 'options': choices}
        if n in shared:
            variant['instructions'] = shared[n][0]
        questions.append({'id': f'MPPSC-{year}-{n:03}', 'question_number': n, 'language_variants': {'en': variant}})
    expected = set(range(1, (150 if year == 2009 else 120) + 1))
    actual = {q['question_number'] for q in questions} | {q['question_number'] for q in excluded}
    if actual != expected or len(questions) + len(excluded) != len(expected):
        raise ValueError(f'{year}: missing/duplicate question numbers: {sorted(expected-actual)}')
    return {'status': 'PDF-derived staging; source identity and individual wording still require review',
            'source_pdf': pdf.relative_to(ROOT).as_posix(), 'source_pdf_sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
            'extracted_text': text_file.relative_to(ROOT).as_posix(), 'extracted_text_sha256': hashlib.sha256(text_file.read_bytes()).hexdigest(),
            'excluded_candidates': excluded, 'questions': questions}


def main():
    for year in (2009, 2010):
        obj = extract(year)
        rendered = json.dumps(obj, ensure_ascii=False, indent=2) + '\n'
        file = DIR / f'pdf-transcription-{year}.json'
        if sys.argv[1:] == ['--check']:
            if not file.exists() or file.read_text(encoding='utf8') != rendered:
                raise ValueError(f'{year}: staged data differs')
        elif not sys.argv[1:]:
            file.write_text(rendered, encoding='utf8')
        else:
            raise ValueError('usage: transcribe-2009-2010-pdf.py [--check]')
        print(year, len(obj['questions']), 'staged;', len(obj['excluded_candidates']), 'excluded')

if __name__ == '__main__':
    main()
