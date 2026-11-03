#!/usr/bin/env python3
"""Conservatively stage recoverable English questions from the supplied files.

The supplied sources contain answer lines. These delimit blocks but their values
are discarded, not used as keys or classifications. See PROGRESS.md for gaps.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'
SOURCES = {2009: 'MPPSC Prelims General Studies Solved Question paper 2009.md',
           2010: 'MPPSC Prelims General Studies  Solved Question paper 2010.md'}
ANSWER = re.compile(r'(?m)^Ans\s*:\s*\([^\n)]*\)\s*$')
NUMBER = re.compile(r'(?m)^(\d{1,3})\.?\s+([^\n]+)')
OPTION = re.compile(r'(?m)^\(([A-D])\)\s*')
FURNITURE = re.compile(r'^(?:# Page \d+|Page \d+|File hosted by educationobserver\.com/forum|Madhya Pradesh PSC MPPSC 2010 Preliminary Question Paper with Answer|http://\S+(?: Page \d+)?)$')


def clean(text):
    return '\n'.join(line.strip().replace('**', '') for line in text.splitlines()
                     if line.strip() and not FURNITURE.fullmatch(line.strip().replace('**', ''))).strip()


def extract(year):
    raw = (DIR / SOURCES[year]).read_bytes()
    text = raw.decode('utf-8')
    # Shared assertion/reason directions and option texts are printed once.
    shared = None
    if year == 2009:
        header = text.split('Directions—(Q. 101 to 110)', 1)[1].split('101. Assertion', 1)[0]
        opts = list(OPTION.finditer(header))
        assert [m.group(1) for m in opts] == list('ABCD')
        shared = [{'key': m.group(1), 'text': clean(header[m.end():opts[i+1].start() if i+1 < len(opts) else len(header)])} for i, m in enumerate(opts)]
    result, rejected, last, start = [], [], 0, 0
    for answer in ANSWER.finditer(text):
        block = text[start:answer.start()]
        start = answer.end()
        candidates = [m for m in NUMBER.finditer(block) if last < int(m.group(1)) <= 150]
        if not candidates:
            continue
        q = candidates[0]
        number = int(q.group(1))
        last = number
        content = clean(block[q.end(1):].lstrip('. '))
        options = list(OPTION.finditer(content))
        if year == 2009 and 101 <= number <= 110:
            question, choices = content, shared
        else:
            question = content[:options[0].start()].strip() if options else content
            choices = [{'key': m.group(1), 'text': content[m.end():options[i+1].start() if i+1 < len(options) else len(content)].strip()} for i, m in enumerate(options)]
        reason = None
        if year == 2009 and number in (46, 75, 76, 77, 78, 145):
            reason = 'missing page, diagram, table or options'
        if year == 2010 and number == 17:
            reason = 'missing page; following options belong to another question'
        if [o['key'] for o in choices] != list('ABCD') or not question or any(not o['text'] for o in choices):
            reason = reason or 'missing or malformed options'
        if reason:
            rejected.append({'question_number': number, 'reason': reason})
            continue
        row = {'id': f'MPPSC-{year}-{number:03}', 'question_number': number,
               'language_variants': {'en': {'question_text': question, 'options': choices}}}
        if year == 2009 and 101 <= number <= 110:
            row['language_variants']['en']['instructions'] = 'Directions—(Q. 101 to 110) : The following ten questions consist of two statements; one labelled as the ‘Assertion (A)’ and the other as ‘Reason (R)’. You have to examine the two statements and select the answer to these questions using the code below—'
        result.append(row)
    return {'status': 'source-derived staging; manual source comparison required',
            'source': (DIR / SOURCES[year]).relative_to(ROOT).as_posix(),
            'source_sha256': hashlib.sha256(raw).hexdigest(), 'excluded_candidates': rejected,
            'questions': result}


def main():
    for year in SOURCES:
        out = DIR / f'transcription-{year}.json'
        data = extract(year)
        rendered = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        if sys.argv[1:] == ['--check']:
            if not out.exists() or out.read_text() != rendered:
                raise ValueError(f'{year} staging differs from source')
        elif not sys.argv[1:]:
            out.write_text(rendered)
        else:
            raise ValueError('usage: transcribe-2009-2010.py [--check]')
        print(year, len(data['questions']), 'staged;', len(data['excluded_candidates']), 'excluded', data['excluded_candidates'])

if __name__ == '__main__':
    main()
