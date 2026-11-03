#!/usr/bin/env python3
"""Extract the 2011 supplied English transcription without reading its answer key.

The input is a third-party solved paper, not a scan or an official answer key.
Document headers/footers and Markdown emphasis are removed; words are unchanged.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/pyq/source/2009-2011/MPPSC Prelims General Studies  Solved Question paper 2011.md'
OUTPUT = ROOT / 'data/pyq/source/2009-2011/transcription-2011.json'
QUESTION = re.compile(r'(?m)^(\d{1,3})\.\s+')
OPTION = re.compile(r'(?m)^\(([A-D])\)\s*')
FURNITURE = re.compile(r'^(?:# Page \d+|Page \d+|File hosted by educationobserver\.com/forum|MPPSC General Studies 2011|http://www\.developindiagroup\.co\.in/(?: Page \d+)?)$')


def main():
    raw = SOURCE.read_bytes()
    source = raw.decode('utf-8').split('**ANSWERS**', 1)
    if len(source) != 2:
        raise ValueError('Could not locate answer section boundary')
    # Remove furniture before splitting so page breaks do not interrupt questions.
    lines = []
    for line in source[0].splitlines():
        text = line.strip().replace('**', '')
        if text and not FURNITURE.fullmatch(text):
            lines.append(text)
    text = '\n'.join(lines)
    matches = list(QUESTION.finditer(text))
    if [int(m.group(1)) for m in matches] != list(range(1, 121)):
        raise ValueError('Question numbers must be exactly 1–120 in order')
    result = []
    for i, match in enumerate(matches):
        number = i + 1
        block = text[match.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip()
        options = list(OPTION.finditer(block))
        if [m.group(1) for m in options] != list('ABCD'):
            raise ValueError(f'Q{number}: expected four ordered options')
        question = block[:options[0].start()].strip()
        choices = [{'key': option.group(1), 'text': block[option.end():options[j+1].start() if j+1 < len(options) else len(block)].strip()} for j, option in enumerate(options)]
        if not question or any(not o['text'] for o in choices):
            raise ValueError(f'Q{number}: empty text')
        result.append({'id': f'MPPSC-2011-{number:03}', 'question_number': number,
                       'language_variants': {'en': {'question_text': question, 'options': choices}}})
    out = {'status': 'source-derived staging; manual source comparison required',
           'source': SOURCE.relative_to(ROOT).as_posix(), 'source_sha256': hashlib.sha256(raw).hexdigest(),
           'normalization': 'Markdown emphasis and document furniture removed; English only.', 'questions': result}
    rendered = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
    if sys.argv[1:] == ['--check']:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != rendered:
            raise ValueError('Stored transcription differs from source extraction')
        print('2011: 120 staged questions match deterministic extraction; manual review still required')
    elif not sys.argv[1:]:
        OUTPUT.write_text(rendered, encoding='utf-8')
        print('2011: staged 120 English questions; manual review still required')
    else:
        raise ValueError('usage: transcribe-2011-paper.py [--check]')


if __name__ == '__main__':
    main()
