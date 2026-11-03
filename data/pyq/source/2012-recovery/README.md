# 2012 recovery — quarantined source material

These files are preserved byte-for-byte from the supplied uploads, not approved
question-bank data. **Do not run the recovered generators in the repository:**
they overwrite `data/pyq/mymppsc-pyq-bank.json`, are not idempotent, and assert
unsubstantiated verification. They predate the existing reproducible bank pipeline.
The source transcription remains keyless. The app-facing bank separately applies the independent reassessment: 79 source-supported answers and explanations, seven disputed and fourteen unresolved unkeyed records. These are not an authenticated MPPSC key. The recovered generators remain quarantined and were not used to build the live 2012 records.

| Upload | Preserved as | Scope |
| --- | --- | --- |
| `New Text Document-2.txt` | `bank-fragment.txt` | Incomplete JSON: starts in an existing paper; the questions array begins mid-record; has an extra closing brace. Not a standalone bank. |
| `New Text Document (2)-2.txt` | `generate_2012_batch1.py` | 2012 paper and Q1–10. |
| `New Text Document (3)-2.txt` | `generate_2012_batch2.py` | Q11–35. |
| `New Text Document (4)-2.txt` | `generate_2012_batch3.py` | Q36–100, despite the Q36–65 docstring. |
| `MPPSC-Prelims-Exam-Paper-2012-Paper-I.md` | same name | Supplied bilingual transcription, no answer key identified. |

The script filenames are descriptive recovery names inferred from the scripts;
the uploads themselves did not name the original files. Copies retain their
original bytes and line endings. They contain temporary absolute source paths,
which are historical claims rather than usable provenance paths.

## Reproduction and comparison

Run `python3 tools/audit-2012-recovery.py` from the repository root. It runs the
three recovered generators sequentially **only in a temporary directory** using
a copy of the current bank; it does not modify the bank or output an importable
file. It checks the 100 IDs, collisions, preservation of original paper and
question records, taxonomy membership and selected evidence indicators. A zero
exit status only means its structural comparison passed; it does not certify
accuracy. Execution is limited to these locally preserved legacy scripts, which
were inspected before use.

Against the baseline at `fdc54143cd3b35c87e646f36b1bcf1ed0c3b9ad3`:

- The scripts append 100 IDs, `MPPSC-2012-001` through `-100`, with no
  collisions or duplicate IDs. Original paper and question records remain
  identical in the disposable output. The fragment contains 100 parseable 2012
  objects; each exactly equals its corresponding generated object. This does
  not reconstruct the missing portion of the fragment.
- 78 records have no URL in their claimed verification evidence; 78 have no
  explanation sources. A URL's presence alone is not verification. All 100
  contain `verified_answer` assertions, none independently established by the
  structural audit. The 2012 source transcription has no identified key.
- Six single-correct records mark more than one option correct in explanation
  option entries: 044, 064, 082, 085, 090 and 100. Some are "all of the above"
  questions, but the representation conflicts with the single answer selection
  and must be reviewed, not automatically corrected.
- Eight subtopics are not in the current taxonomy: 002, 040, 051, 052, 073,
  076, 078 and 080. Topic and subject membership need semantic review as well.
- **Q31:** the generators move the four original option statements into the
  question and replace the options with "(A) only" etc. in both languages.
- **Q96:** options B–D differ materially from the supplied paper in both
  languages; B/C/D were changed or reordered. Source page 35 must be preserved.
- **Q34:** the recovered answer B (Ministry of Railways) and its explanation
  conflict with the Ministry of Parliamentary Affairs' own [handbook](https://www.mpa.gov.in/sites/default/files/parlia1.pdf),
  which says constitution and working of zonal railway informal consultative
  committees were assigned to that ministry. This supports C, not B. No official
  2012 answer key has been located here.
- **Q100:** the script selects D and claims all three purposes are specified in
  section 14. The [original Act on India Code](https://www.indiacode.nic.in/bitstream/123456789/16874/1/sc_st_(preventionofatrocities)_act_1989.pdf)
  states the purpose as speedy trial, supporting A. Later legislation should not
  be projected back onto the 2012 question. No official 2012 key was checked.

The Q31/Q96 comparisons are focused findings, not a complete bilingual
transcription audit. The two researched answers are not an audit of all 100.
The independent research completed so far, including option-by-option explanations
and unresolved questions, is in [ANSWER_AUDIT_BATCH_1.md](ANSWER_AUDIT_BATCH_1.md).
The later independent reassessment and its evidence are in `answer-reassessment-2012.json`. The rebuild adapter requires and validates that file. Disputed and unresolved records remain unkeyed; source limitations remain documented there. Existing scoring
policy for 2013 onward does not by itself establish 2012 policy. Application
validator acceptance is structural, not proof of source or answer accuracy.
