#!/usr/bin/env python3
"""Extract an unreviewed, bilingual 2012 transcription from the supplied paper.

Output is staging material, not the app-facing bank. This script intentionally
never reads answer keys, explanations or the recovered generators. It removes
only document separators, page furniture and Markdown emphasis and keeps the
paper's words, numbers and option order. Review its output against the source.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/pyq/source/2012-recovery/MPPSC-Prelims-Exam-Paper-2012-Paper-I.md'
OUTPUT = ROOT / 'data/pyq/source/2012-recovery/transcription-staging.json'
NUMBER = re.compile(r'(?m)^\s*(\d{1,3})\.\s+')
OPTION = re.compile(r'(?m)^\s*\(([A-D])\)\s*')
DEVANAGARI = re.compile(r'[\u0900-\u097f]')
FURNITURE = re.compile(r'^(?:# Page \d+|---|\*\*P/G/I/2012[—-]A\*\*|P/G/I/2012[—-]A|P\.T\.O\.|Download From:.*)$')


def clean(text):
    lines = []
    after_page_heading = False
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if re.fullmatch(r'# Page \d+', line):
            after_page_heading = True
            continue
        if after_page_heading and re.fullmatch(r'\d{1,2}', line):
            after_page_heading = False
            continue
        if FURNITURE.fullmatch(line):
            continue
        after_page_heading = False
        # Stars are Markdown emphasis in this source, not question text.
        lines.append(line.replace('*', ''))
    return '\n'.join(lines)


def main():
    raw = SOURCE.read_bytes()
    text = raw.decode('utf-8')
    markers = list(NUMBER.finditer(text))
    questions = {}
    for index, marker in enumerate(markers):
        number = int(marker.group(1))
        if number not in range(1, 101):
            raise ValueError(f'unexpected question number {number}')
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        block = text[marker.end():end]
        options = list(OPTION.finditer(block))
        if [m.group(1) for m in options] != list('ABCD'):
            raise ValueError(f'Q{number}: malformed option labels')
        stem = clean(block[:options[0].start()])
        lang = 'hi' if DEVANAGARI.search(stem) else 'en'
        variants = questions.setdefault(number, {})
        if lang in variants:
            raise ValueError(f'Q{number}: duplicate {lang} variant')
        values = []
        for i, match in enumerate(options):
            stop = options[i + 1].start() if i + 1 < len(options) else len(block)
            value = clean(block[match.end():stop])
            if not value:
                raise ValueError(f'Q{number} {lang}: empty option {match.group(1)}')
            values.append({'key': match.group(1), 'text': value})
        if not stem:
            raise ValueError(f'Q{number} {lang}: empty stem')
        variants[lang] = {'question_text': stem, 'options': values}
    if set(questions) != set(range(1, 101)):
        raise ValueError(f'question numbers missing: {sorted(set(range(1, 101)) - set(questions))}')
    for number, variants in questions.items():
        if set(variants) != {'en', 'hi'}:
            raise ValueError(f'Q{number}: missing language variant')
    result = {
        'status': 'unreviewed transcription staging; not a question bank',
        'source': SOURCE.relative_to(ROOT).as_posix(),
        'source_sha256': hashlib.sha256(raw).hexdigest(),
        'normalization': 'Markdown emphasis and document furniture removed; line breaks retained.',
        'questions': [{'id': f'MPPSC-2012-{n:03}', 'question_number': n,
                       'language_variants': questions[n]} for n in range(1, 101)],
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if sys.argv[1:] == ['--check']:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != rendered:
            raise ValueError('staged transcription differs from source extraction')
        print(f'Checked {len(questions)} bilingual staged questions; manual review required.')
    elif not sys.argv[1:]:
        OUTPUT.write_text(rendered, encoding='utf-8')
        print(f'Extracted {len(questions)} bilingual questions to {OUTPUT.relative_to(ROOT)}; manual review required.')
    else:
        raise ValueError('usage: transcribe-2012-paper.py [--check]')


if __name__ == '__main__':
    main()
