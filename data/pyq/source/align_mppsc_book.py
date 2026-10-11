#!/usr/bin/env python3
"""
Align two-column extracted MPPSC solved-PYQ Markdown with the MyMPPSC intake format.

This is a deterministic text parser. It does not call AI, verify answers, classify
topics, translate text, or repair source content. Ambiguous/incomplete records are
sent to a review JSON instead of silently being discarded.

Recommended:
  python scripts/align_mppsc_book.py --input "output/YOUR_BOOK_columns.md" --out-dir "output/MPPSC_APP_BANK"

Then, from the MyMPPSC repository:
  node tools/build-bank.mjs --in "output/MPPSC_APP_BANK/MPPSC_PYQ_intake.json" --out "output/MPPSC_APP_BANK/MPPSC_PYQ_AppBank.json"
  node tools/build-bank.mjs --validate "output/MPPSC_APP_BANK/MPPSC_PYQ_AppBank.json"
"""
from __future__ import annotations
import argparse, json, re, hashlib
from pathlib import Path
from datetime import datetime, timezone

VERSION = "0.1.0"
QSTART = re.compile(r"^\s*(\d{1,3})\.\s+(.+?)\s*$")
OPTION = re.compile(r"^\s*([A-D])\.\s*(.*?)\s*$", re.I)
ANSWER = re.compile(r"^\s*(?:Answer|Ans\.?|Correct\s+Answer)\s*[-:–]\s*(.*?)\s*$", re.I)
SECTION = re.compile(r"^\s*(Explanation|Additional\s+Information|Additional\s+information|Extra\s+Information)\s*:\s*(.*?)\s*$", re.I)
PAGE = re.compile(r"^\s*<!--\s*PDF PAGE (\d+)\s*-->\s*$", re.I)
COLUMN = re.compile(r"^\s*<!--\s*PDF PAGE (\d+) (LEFT|RIGHT) COLUMN\s*-->\s*$", re.I)
PAPER_HEADER = re.compile(r"\bMPPSC\s+(20\d{2})\s+PRELIM\b", re.I)
BULLET = re.compile(r"^\s*(?:❖|➢|•|[-*])\s*")

def clean_line(s: str) -> str:
    return BULLET.sub("", s).strip()

def is_question_start(line: str) -> bool:
    m = QSTART.match(line)
    if not m:
        return False
    # The extracted book's question stems generally start with a capital letter,
    # quotation mark, numeral, or an explicitly marked deleted question.
    tail = m.group(2).strip()
    return bool(tail) and (tail[0].isupper() or tail[0] in "\\\"'“‘(" or tail.upper() == "DELETED")

def parse_answer(raw: str):
    raw = raw.strip().rstrip(".")
    # Keep only option keys if the whole printed answer is an option list.
    vals = re.findall(r"(?<![A-Za-z])([A-D])(?![A-Za-z])", raw.upper())
    residue = re.sub(r"(?<![A-Za-z])[A-D](?![A-Za-z])", "", raw.upper())
    residue = re.sub(r"[\s,;/&()]", "", residue)
    if vals and not residue:
        # unique in printed order
        return list(dict.fromkeys(vals))
    return None

def split_record(lines, start_page, paper_year, source_file):
    qmatch = QSTART.match(lines[0])
    qnum = int(qmatch.group(1))
    body = [qmatch.group(2).strip()]
    options = []
    answer = None
    explanation_lines, additional_lines = [], []
    section = "stem"
    flags = []
    option_started = False
    deleted = qmatch.group(2).strip().upper() == "DELETED"
    matching_mode = bool(re.search(r"match\s+(?:list|the following)|match list", qmatch.group(2), re.I))
    codes_seen = False

    for raw in lines[1:]:
        line = raw.strip()
        if not line:
            continue
        # Ignore running headers/footers from the page layout, but retain source location.
        if line.upper() in {"NARY EXAM PAPER I", "MPPSC 2019 PRELIM", "MPPSC 2020 PRELIM",
                            "MPPSC 2021 PRELIM", "MPPSC 2022 PRELIM", "MPPSC 2023 PRELIM",
                            "MPPSC 2024 PRELIM"}:
            continue
        if matching_mode and re.match(r"^\s*Codes?\s*:", line, re.I):
            codes_seen = True
            body.append(line.strip())
            section = "options"
            continue
        om = OPTION.match(line)
        if om and section in ("stem", "options"):
            if matching_mode and not codes_seen:
                # The first A-D-labelled rows in a matching question are table rows,
                # not answer choices. Preserve them in the stem until the Codes line.
                # Some extracted rows contain "Codes:" on the same line as row D.
                code_pos = re.search(r"\bCodes?\s*:", line, re.I)
                if code_pos:
                    body.append(line[:code_pos.start()].strip())
                    codes_seen = True
                    section = "options"
                else:
                    body.append(line.strip())
                continue
            key, txt = om.group(1).upper(), om.group(2).strip()
            options.append({"key": key, "text": txt})
            option_started = True
            section = "options"
            continue
        am = ANSWER.match(line)
        if am:
            answer = parse_answer(am.group(1))
            section = "after_answer"
            if answer is None:
                flags.append("printed_answer_not_parseable")
            continue
        sm = SECTION.match(line)
        if sm:
            label, inline = sm.group(1).lower(), sm.group(2).strip()
            if label.startswith("explanation"):
                section = "explanation"
                if inline: explanation_lines.append(inline)
            else:
                section = "additional"
                if inline: additional_lines.append(inline)
            continue
        # The heading "This Section has been Edited from the syllabus" belongs
        # to the source record; keep it as text rather than guessing its meaning.
        text = clean_line(line)
        if not text:
            continue
        if section == "stem":
            body.append(text)
        elif section == "options":
            # Wrapped option text continues until next option or answer.
            # If a matching-table row has not produced an option object, keep it in stem.
            if options:
                options[-1]["text"] = (options[-1]["text"] + " " + text).strip()
            else:
                body.append(text)
        elif section == "explanation":
            explanation_lines.append(text)
        elif section == "additional":
            additional_lines.append(text)
        else:
            # Unlabelled post-answer facts: preserve as additional information.
            additional_lines.append(text)

    stem = " ".join(x for x in body if x).strip()
    # If options were not detected but this isn't explicitly deleted, retain record for review.
    if not options and not deleted: flags.append("missing_options")
    if len({o["key"] for o in options}) != len(options): flags.append("duplicate_option_key")
    if options and set(o["key"] for o in options) != {"A","B","C","D"}:
        flags.append("option_set_not_A_to_D")
    if answer is None: flags.append("missing_or_unparsed_answer")
    if not explanation_lines: flags.append("missing_explanation")
    if deleted: flags.append("deleted_question")
    if not stem or stem.upper() == "DELETED": flags.append("missing_question_stem")

    qtype = "multiple_correct" if answer and len(answer) > 1 else "single_correct"
    # Conservative: a matching table may need the app's non-shuffleable type.
    if re.search(r"match\s+(?:list|the following)|codes\s*:", stem, re.I):
        qtype = "matching"
    elif re.search(r"assertion|reason\s*\(", stem, re.I):
        qtype = "assertion_reason"
    elif re.search(r"statements?\s*[.:]|following statements", stem, re.I):
        qtype = "statement_based"

    qid = f"MPPSC-{paper_year or 'UNKNOWN'}-{qnum:03d}"
    question = {
        "id": qid,
        "paper_id": f"MPPSC-{paper_year or 'UNKNOWN'}-GS1-BOOK",
        "question_number": qnum,
        "question_type": qtype,
        "en": {"question_text": stem, "options": options},
        "answer": answer,
        "answer_status": "unofficial" if answer else "missing",
        "answer_source": "Solved PYQ book (printed answer; not independently verified)",
        "explanation": {
            "status": "unreviewed",
            "correct_reasoning": "\\n".join(explanation_lines).strip() if explanation_lines else None,
            "language": "en",
        } if explanation_lines else None,
        "explanation_status": "unreviewed" if explanation_lines else "missing",
        "source_reference": {
            "file": source_file,
            "page": start_page,
            "question_location": f"Q{qnum}",
            "note": "Extracted from two-column Markdown. Page is the question's starting PDF page; continuations may span later columns/pages."
        },
        "metadata": {
            "book_additional_information": "\\n".join(additional_lines).strip() if additional_lines else None,
            "source_answer_text_preserved_as_options": answer is not None,
            "parser_version": VERSION,
        },
    }
    if answer is None:
        # The MyMPPSC intake builder treats explicit JSON null as a literal answer
        # token. Omit the shorthand field and set answer_status=missing instead.
        question.pop("answer", None)
        question["answer_status"] = "missing"
        question["answer_source"] = None
    review = {
        "id": qid, "year": paper_year, "question_number": qnum,
        "start_page": start_page, "flags": list(dict.fromkeys(flags)),
        "question_preview": stem[:240], "option_count": len(options),
        "printed_answer": answer, "has_explanation": bool(explanation_lines),
        "parsed_record": question,
    }
    return question, review

def main():
    ap = argparse.ArgumentParser(description="Align extracted MPPSC solved-PYQ Markdown to MyMPPSC intake JSON.")
    ap.add_argument("--input", required=True, help="Existing *_columns.md file; does not read the PDF.")
    ap.add_argument("--out-dir", required=True, help="Output folder for intake and review files.")
    ap.add_argument("--bank-id", default="mppsc-solved-pyq-book-2019-2024")
    ap.add_argument("--bank-name", default="MPPSC Solved Previous-Year Questions 2019–2024 (book source)")
    args = ap.parse_args()
    inp = Path(args.input)
    if not inp.is_file():
        raise SystemExit(f"Input Markdown not found: {inp}")
    raw = inp.read_text(encoding="utf-8-sig")
    lines = raw.splitlines()
    source_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    outdir = Path(args.out_dir)
    outdir.mkdir(parents=True, exist_ok=True)

    records = []
    current_year = None
    current_page = None
    active = None
    active_page = None
    active_year = None
    detected_papers = []
    def flush():
        nonlocal active
        if active is not None:
            records.append((active, active_page, active_year))
            active = None

    # Combine structural evidence with monotonic question numbering. A numbered
    # line inside an explanation (e.g. "1. If a woman's husband dies") must not
    # become a question. Real questions normally advance the paper sequence.
    last_question_number_by_year = {}
    pending_new_year = False
    for idx, line in enumerate(lines):
        pm = PAGE.match(line)
        if pm:
            current_page = int(pm.group(1))
            continue
        cm = COLUMN.match(line)
        if cm:
            current_page = int(cm.group(1))
            continue
        hm = PAPER_HEADER.search(line)
        if hm:
            current_year = int(hm.group(1))
            pending_new_year = True
            if current_year not in detected_papers:
                detected_papers.append(current_year)

        qmatch = QSTART.match(line)
        starts_q = False
        if qmatch and is_question_start(line):
            candidate = int(qmatch.group(1))
            last_num = last_question_number_by_year.get(current_year)
            if pending_new_year and candidate == 1:
                starts_q = True
            elif last_num is None:
                starts_q = True
            elif candidate > last_num and candidate <= last_num + 5:
                # A small forward gap is tolerated; the report/audit can reveal gaps.
                # Repeated low numbers in numbered explanation lists are rejected.
                tail = []
                for future in lines[idx + 1: idx + 26]:
                    if QSTART.match(future) and is_question_start(future):
                        break
                    tail.append(future)
                option_keys = {m.group(1).upper() for future in tail if (m := OPTION.match(future))}
                starts_q = len(option_keys) >= 2
        if starts_q:
            flush()
            active = [line]
            active_page = current_page
            active_year = current_year
            last_question_number_by_year[current_year] = int(qmatch.group(1))
            pending_new_year = False
        elif active is not None:
            active.append(line)
    flush()

    questions, review_rows = [], []
    for block, page, year in records:
        q, r = split_record(block, page, year, inp.name)
        # Only structurally importable records go to the app intake. Everything else
        # remains in the review file with its full parsed record and flags.
        duplicate_keys = len({o["key"] for o in q["en"]["options"]}) != len(q["en"]["options"])
        has_usable_options = len(q["en"]["options"]) >= 2 and not duplicate_keys
        if not has_usable_options:
            r["excluded_from_intake"] = True
            r["flags"] = list(dict.fromkeys(r["flags"] + (["duplicate_option_key"] if duplicate_keys else []) + (["no_usable_options"] if not has_usable_options else [])))
        else:
            r["excluded_from_intake"] = False
            questions.append(q)
        review_rows.append(r)

    # Count records per year and create separate app papers. Do not invent scoring rules.
    by_year = {}
    for q in questions:
        y = q["id"].split("-")[1]
        by_year.setdefault(y, []).append(q)
    papers = []
    for y, qs in by_year.items():
        year = int(y) if y.isdigit() else None
        pid = f"MPPSC-{y}-GS1-BOOK"
        papers.append({
            "paper_id": pid,
            "exam": "MPPSC State Service Preliminary Examination",
            "year": year,
            "paper_name": f"MPPSC {year} Prelims — solved-book transcription" if year else "MPPSC Prelims — year not identified",
            "paper_code": "GS-I",
            "set_code": None,
            "language": "en",
            "original_question_count": None,
            "duration_minutes": None,
            "total_marks": None,
            "scoring": {"rules_known": False, "marks_per_correct": None, "negative_marks_per_incorrect": None,
                        "negative_marking_enabled": None, "marks_for_unanswered": None, "rules_source": None,
                        "notes": "Not supplied by the extracted solved book; configure before using full-paper scoring."},
            "question_order": [q["id"] for q in sorted(qs, key=lambda x: x["question_number"])],
            "answer_key": {"source": "Solved PYQ book", "status": "unofficial", "published_at": None,
                           "notes": "Printed book answers are preserved; not independently verified."},
            "source_files": [{"path": inp.name, "pages": None, "sha256": source_hash}],
            "is_demonstration": False,
            "metadata": {"source_kind": "coaching_material", "parser_version": VERSION}
        })
    intake = {
        "intake_version": "1.0.0",
        "bank_id": args.bank_id,
        "bank_name": args.bank_name,
        "exam_default": "MPPSC State Service Preliminary Examination",
        "is_demonstration": False,
        "default_language": "en",
        "provenance": {
            "kind": "coaching_material", "verified": False,
            "notes": "Transcribed from a solved PYQ book's extracted text. Printed answers/explanations are not independently verified. Source wording is preserved as far as the extraction provides.",
            "sources": [{"description": inp.name, "url": None, "retrieved_at": None}]
        },
        "papers": papers,
        "questions": questions
    }
    numbering_gaps_by_year = {}
    for year in detected_papers:
        seen_numbers = {r["question_number"] for r in review_rows if r["year"] == year}
        max_seen = max(seen_numbers, default=0)
        gaps = [n for n in range(1, max_seen + 1) if n not in seen_numbers]
        if gaps:
            numbering_gaps_by_year[str(year)] = gaps
    review = {
        "report_version": "1.0.0",
        "input_file": inp.name,
        "input_sha256": source_hash,
        "parser_version": VERSION,
        "detected_paper_years": detected_papers,
        "numbering_gaps_by_year": numbering_gaps_by_year,
        "stats": {
            "question_blocks_detected": len(review_rows),
            "records_exported_to_intake": len(questions),
            "records_excluded_pending_review": sum(r.get("excluded_from_intake", False) for r in review_rows),
            "records_with_no_flags": sum(not r["flags"] for r in review_rows),
            "records_flagged_for_review": sum(bool(r["flags"]) for r in review_rows),
            "missing_stem": sum("missing_question_stem" in r["flags"] for r in review_rows),
            "missing_options": sum("missing_options" in r["flags"] for r in review_rows),
            "missing_or_unparsed_answer": sum("missing_or_unparsed_answer" in r["flags"] for r in review_rows),
            "missing_explanation": sum("missing_explanation" in r["flags"] for r in review_rows),
            "deleted_question_records": sum("deleted_question" in r["flags"] for r in review_rows),
        },
        "records": review_rows,
        "important": [
            "This is structural parsing only, not answer verification.",
            "Question numbering may reset each year; IDs include the detected year.",
            "Numbering gaps are listed per year. They may indicate deleted questions, extraction gaps, or question starts that need manual review; do not assume they are absent from the source without checking.",
            "The source book can contain errors; supplied answers are marked unofficial.",
            "Review all flagged records and run MyMPPSC's own bank builder/validator before import."
        ]
    }
    (outdir / "MPPSC_PYQ_intake.json").write_text(json.dumps(intake, ensure_ascii=False, indent=2), encoding="utf-8")
    (outdir / "MPPSC_PYQ_Review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    (outdir / "MPPSC_PYQ_BuildReport.json").write_text(json.dumps({
        "input_file": inp.name, "input_sha256": source_hash, "parser_version": VERSION,
        "stats": review["stats"], "papers": [{"paper_id": p["paper_id"], "year": p["year"], "question_count": len(p["question_order"])} for p in papers]
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Alignment complete.")
    print(f"Input: {inp}")
    print(f"Question blocks detected: {len(review_rows)}")
    print(f"Exported to app intake: {len(questions)}")
    print(f"Excluded pending review: {review['stats']['records_excluded_pending_review']}")
    print(f"Years detected: {', '.join(map(str, detected_papers)) or 'none'}")
    print(f"Flagged for review: {review['stats']['records_flagged_for_review']}")
    print(f"Output folder: {outdir.resolve()}")
    print("Next: run MyMPPSC's tools/build-bank.mjs on MPPSC_PYQ_intake.json, then --validate the resulting bank.")

if __name__ == "__main__":
    main()
