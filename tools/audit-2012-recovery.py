#!/usr/bin/env python3
"""Inspect the recovered 2012 scripts in a disposable bank; never write the live bank.

These legacy scripts write to a relative path. Run them only in a temporary
working directory. Their output is an unreviewed candidate, NOT an import.
"""
import collections
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/pyq/source/2012-recovery'
BASE = ROOT / 'data/pyq/mymppsc-pyq-bank.json'


def fragment_questions():
    text = (SOURCE / 'bank-fragment.txt').read_text(encoding='utf-8')
    marker = text.index('"id": "MPPSC-2012-001"')
    start = text.rfind('\n    {', 0, marker)
    if start < 0:
        raise ValueError('2012 fragment start not found')
    pos = text.index('{', start)
    decoder = json.JSONDecoder()
    result = []
    while pos < len(text):
        try:
            obj, end = decoder.raw_decode(text, pos)
        except json.JSONDecodeError:
            break
        if not isinstance(obj, dict):
            break
        result.append(obj)
        pos = end
        while pos < len(text) and text[pos] in ' \t\r\n,':
            pos += 1
    return result


def main():
    baseline = json.loads(BASE.read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='mymppsc-2012-audit-') as tmp:
        work = Path(tmp)
        target = work / 'data/pyq/mymppsc-pyq-bank.json'
        target.parent.mkdir(parents=True)
        # Recovery generators must see the pre-2012 baseline, even after the
        # source-derived paper has been integrated into the live bank.
        baseline['questions'] = [q for q in baseline['questions'] if q.get('year') != 2012]
        baseline['papers'] = [p for p in baseline['papers'] if p.get('year') != 2012]
        target.write_text(json.dumps(baseline, ensure_ascii=False), encoding='utf-8')
        for batch in (1, 2, 3):
            subprocess.run([sys.executable, str(SOURCE / f'generate_2012_batch{batch}.py')],
                           cwd=work, check=True, stdout=subprocess.DEVNULL)
        candidate = json.loads(target.read_text(encoding='utf-8'))
    questions = [q for q in candidate['questions'] if q.get('year') == 2012]
    ids = [q['id'] for q in questions]
    expected = {f'MPPSC-2012-{n:03}' for n in range(1, 101)}
    taxonomy = json.loads((ROOT / 'data/taxonomy/mppsc-taxonomy.json').read_text(encoding='utf-8'))
    tree = {s['subject']: {t['topic']: t['subtopics'] for t in s['topics']} for s in taxonomy['subjects']}
    duplicates = [key for key, count in collections.Counter(ids).items() if count > 1]
    non_single_correct = [q['id'] for q in questions if sum(bool(x.get('is_correct')) for x in q['explanation'].get('option_explanations', [])) != 1]
    invalid_subtopics = [q['id'] for q in questions if q.get('subtopic') not in tree.get(q.get('subject'), {}).get(q.get('topic'), [])]
    fragment = fragment_questions()
    report = {
        'baseline_questions': len(baseline['questions']),
        'baseline_papers': len(baseline['papers']),
        'baseline_question_records_preserved': candidate['questions'][:len(baseline['questions'])] == baseline['questions'],
        'baseline_paper_records_preserved': candidate['papers'][:len(baseline['papers'])] == baseline['papers'],
        'candidate_2012_questions': len(questions),
        'missing_2012_ids': sorted(expected - set(ids)),
        'unexpected_2012_ids': sorted(set(ids) - expected),
        'duplicate_2012_ids': duplicates,
        'collisions_with_baseline': sorted(set(ids) & {q['id'] for q in baseline['questions']}),
        'fragment_2012_objects': len(fragment),
        'fragment_matches_candidate': fragment == questions,
        'without_verification_evidence_url': sum(not any(e.get('url') for e in q.get('verified_answer', {}).get('evidence', [])) for q in questions),
        'without_explanation_sources': sum(not q['explanation'].get('sources') for q in questions),
        'option_reasoning_not_exactly_one_correct': non_single_correct,
        'subtopics_not_in_taxonomy': invalid_subtopics,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    # Structural checks only. A successful exit is NOT approval for import.
    if (not report['baseline_question_records_preserved'] or not report['baseline_paper_records_preserved']
        or len(questions) != 100 or report['missing_2012_ids'] or report['unexpected_2012_ids']
        or duplicates or report['collisions_with_baseline'] or not report['fragment_matches_candidate']):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
