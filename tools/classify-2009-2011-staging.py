#!/usr/bin/env python3
"""Assign conservative, provisional subject-level labels to staged questions.

Labels are reviewable staging only. Unsupported lower levels remain null; no
answer key, answer explanation or external knowledge is used as evidence.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'


def numbers(spec):
    result = set()
    for chunk in spec.split(','):
        ends = [int(x) for x in chunk.split('-')]
        result.update(range(ends[0], ends[-1] + 1))
    return result


GROUPS = {
    2009: {
        'Geography': '1-5,7-12,42-44,52,105,123',
        'Environment': '6,20,54,111,114-115',
        'Polity': '13-16,22,56-58,108,127',
        'Economy': '17-19,21,23-25,59-66,69,107,109',
        'Current Affairs': '26-40,122,124-126,128-134',
        'Madhya Pradesh Special': '41,45,53,67-68,70',
        'Art and Culture': '51,55',
        'General Aptitude': '71-74,79-81',
        'Science and Technology': '86-104,110,112-113,116-121',
        'History': '106,135-144',
    },
    2010: {'History': '1-118', 'Current Affairs': '119', 'Polity': '120'},
    2011: {
        'Economy': '6,8,36-37,46,48',
        'Environment': '11,49,89',
        'Science and Technology': '50',
        'Art and Culture': '57,60',
        'Madhya Pradesh Special': '59',
        'Geography': '1-5,7,9-10,12-35,38-45,47,51-56,58,61-88,90-112,113-120',
    },
}


def main():
    taxonomy = json.loads((ROOT / 'data/taxonomy/mppsc-taxonomy.json').read_text())
    valid = {entry['subject'] for entry in taxonomy['subjects']}
    for year, groups in GROUPS.items():
        mapping = {}
        for subject, spec in groups.items():
            if subject not in valid:
                raise ValueError(f'Unknown subject {subject}')
            for number in numbers(spec):
                if number in mapping:
                    raise ValueError(f'duplicate subject: {year} Q{number}')
                mapping[number] = subject
        source = json.loads((DIR / f'transcription-{year}.json').read_text())
        labels = {}
        for q in source['questions']:
            n = q['question_number']
            if n not in mapping:
                raise ValueError(f'No subject for {year} Q{n}')
            labels[q['id']] = {'subject': mapping[n], 'topic': None, 'subtopic': None}
        out = {'status': 'provisional subject-level staging; manual review required',
               'note': 'Lower levels intentionally left unset rather than guessed; source uncertainty remains.',
               'labels': labels}
        rendered = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
        path = DIR / f'taxonomy-{year}.json'
        if sys.argv[1:] == ['--check']:
            if not path.exists() or path.read_text() != rendered:
                raise ValueError(f'{year} labels differ')
        elif not sys.argv[1:]:
            path.write_text(rendered)
        else:
            raise ValueError('usage: classify-2009-2011-staging.py [--check]')
        print(year, len(labels), 'provisional subject labels')

if __name__ == '__main__':
    main()
