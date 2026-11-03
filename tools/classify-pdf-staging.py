#!/usr/bin/env python3
"""Apply tentative subject-level labels to the PDF-derived candidates."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'
spec = importlib.util.spec_from_file_location('old_labels', ROOT / 'tools/classify-2009-2011-staging.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
ADDITIONS = {2009: {'Art and Culture': '46-47', 'History': '48,145-148',
                    'Geography': '49-50,149-150', 'General Aptitude': '82-85'}, 2010: {}, 2011: {}}


def main():
    valid = {s['subject'] for s in json.loads((ROOT / 'data/taxonomy/mppsc-taxonomy.json').read_text())['subjects']}
    for year in (2009, 2010, 2011):
        mapping = {}
        for groups in (old.GROUPS[year], ADDITIONS[year]):
            for subject, spec in groups.items():
                if subject not in valid:
                    raise ValueError(f'Invalid subject: {subject}')
                for n in old.numbers(spec):
                    if n in mapping:
                        raise ValueError(f'Duplicate label for {year} Q{n}')
                    mapping[n] = subject
        source = json.loads((DIR / f'pdf-transcription-{year}.json').read_text())
        labels = {q['id']: {'subject': mapping[q['question_number']], 'topic': None, 'subtopic': None} for q in source['questions']}
        out = {'status': 'provisional subject-level staging; manual review required',
               'note': 'Lower levels intentionally left unset rather than guessed; source identity remains uncertain.', 'labels': labels}
        rendered = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
        path = DIR / f'pdf-taxonomy-{year}.json'
        if sys.argv[1:] == ['--check']:
            if not path.exists() or path.read_text(encoding='utf8') != rendered:
                raise ValueError(f'{year} labels differ')
        elif not sys.argv[1:]:
            path.write_text(rendered, encoding='utf8')
        else:
            raise ValueError('usage: classify-pdf-staging.py [--check]')
        print(year, len(labels), 'provisional subject labels')

if __name__ == '__main__':
    main()
