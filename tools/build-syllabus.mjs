#!/usr/bin/env node
/**
 * build-syllabus.mjs — extracts the official MPPSC 2026 syllabus into JSON.
 *
 * The syllabus text is never typed by hand. Every topic string is lifted from
 * `data/MPPSC 2026 Syllabus.md` at a recorded line and then passed through a
 * single, documented normaliser that removes transcription artefacts only
 * (CR, markdown emphasis markers, stray <sup> tags, `^rd`-style breaks). The
 * build fails if any bullet inside a syllabus region is left unassigned, so a
 * source that gains topics fails loudly instead of quietly dropping them.
 *
 * Exam-administration content is deliberately NOT extracted: the notification
 * (page 1), the prelims exam plan (pages 2-3), the mains exam plan (pages
 * 12-13) and every marks/duration column are skipped. Where a table row mixes
 * curriculum with a marks plan (Paper V and Paper VI), the curriculum is kept
 * and the marks annotation is deleted from it.
 *
 *   node tools/build-syllabus.mjs            # write the JSON
 *   node tools/build-syllabus.mjs --report   # print structure + coverage only
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'data', 'MPPSC 2026 Syllabus.md');
const OUT = path.join(root, 'data', 'syllabus', 'mppsc-2026-syllabus.json');
const GUIDE_DIR = path.join(root, 'data', 'syllabus', 'study-guide');
const reportOnly = process.argv.includes('--report');
const checkGuide = process.argv.includes('--check-guide');

/* ------------------------------------------------------------- normalise -- */

/** Removes transcription artefacts only. Nothing is reworded or reordered. */
export function normaliseTopic(raw) {
  return String(raw)
    .replace(/\r/g, '')
    .replace(/<\/?sup>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\^(\d?(?:st|nd|rd|th))/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deletes a marks plan or a word-count instruction from a curriculum cell.
 *  Deletion only: nothing is reworded, reordered or added. */

export function stripMarksPlan(text) {
  return normaliseTopic(
    String(text)
      .replace(/\d+\s*[x×]\s*\d+\s*(\(\s*[\d०-९]+\s*अंक\s*\))?/gi, ' ')
      .replace(/\(\s*\d+\s*\+\s*\d+(?:\s*\+\s*\d+)*\s*\)/g, ' ')
      .replace(/\(\s*प्रत्येक प्रश्न के\s*\d+\s*अंक होंगे।\s*\)/g, ' ')
      .replace(/अंक\s*-\s*\d+/g, ' ')
      .replace(/अंक\s*:\s*\d+/g, ' ')
      .replace(/\(\s*[\d०-९]+\s*अंक\s*\)/g, ' ')
      .replace(/[\d०-९]+\s*अंक/g, ' ')
      .replace(/\(\s*लगभग\s*[\d०-९]+\s*शब्दों में\s*\)/g, ' '),
  );
}

const isBullet = (line) => /^\s*[*\-]\s+\S/.test(line);
const isOrdered = (line) => /^\s*\d+\.\s+\S/.test(line);
const isHeading = (line) => /^#{1,6}\s+\S/.test(line);
const isTableRow = (line) => line.trim().startsWith('|');
const isBlank = (line) => line.trim() === '';
const bulletText = (line) => normaliseTopic(line.replace(/^\s*[*\-]\s+/, ''));
const orderedText = (line) => normaliseTopic(line.replace(/^\s*\d+\.\s+/, ''));
const headingText = (line) => normaliseTopic(line.replace(/^#{1,6}\s+/, ''));

const markerText = (line) => {
  if (isHeading(line)) return headingText(line);
  const bold = line.match(/^\s*\*\*(.+?)\*\*[\s:–—-]*(.*)$/);
  if (bold) return normaliseTopic(`${bold[1]} ${bold[2]}`);
  return null;
};

const romanToInt = (token) => {
  const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
  return map[String(token).toUpperCase().replace(/\s+/g, '')] ?? null;
};

/* -------------------------------------------------------------- source --- */

const sourceText = await readFile(SOURCE, 'utf8');
const sourceSha = createHash('sha256').update(sourceText).digest('hex');
const lines = sourceText.split(/\r?\n/);

const pageAt = [];
{
  let page = 0;
  lines.forEach((line, i) => {
    const m = line.match(/^# Page (\d+)/);
    if (m) page = Number(m[1]);
    pageAt[i] = page;
  });
}

const contentLineIndexes = new Set();
lines.forEach((line, i) => {
  if (isBullet(line) || isOrdered(line)) contentLineIndexes.add(i + 1);
});

const claimedLines = new Set();
const problems = [];
const warnings = [];
const notes = [];

const topicFrom = (text, line) => ({ text, line, page: pageAt[line - 1] });

const collectTopics = (from, to, claim = true) => {
  const out = [];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return out;
  for (let n = from; n <= to; n += 1) {
    const line = lines[n - 1];
    if (line === undefined || isBlank(line) || isHeading(line) || isTableRow(line)) continue;
    if (isBullet(line)) { out.push(topicFrom(bulletText(line), n)); if (claim) claimedLines.add(n); }
    else if (isOrdered(line)) { out.push(topicFrom(orderedText(line), n)); if (claim) claimedLines.add(n); }
  }
  return out;
};

/* -------------------------------------------------------- prelims -------- */

/** `#### 1. Title` sections with bullets beneath. */
function prelimsHeadings(from, to) {
  const sections = [];
  const headingLines = [];
  for (let n = from; n <= to; n += 1) {
    if (!isHeading(lines[n - 1])) continue;
    const m = headingText(lines[n - 1]).match(/^(\d+)\.\s*(.+)$/);
    if (!m) { claimedLines.add(n); continue; }
    headingLines.push({ n, number: m[1], title: m[2] });
  }
  headingLines.forEach((h, i) => {
    const end = i + 1 < headingLines.length ? headingLines[i + 1].n - 1 : to;
    sections.push({
      number: h.number,
      title: h.title,
      line: h.n,
      page: pageAt[h.n - 1],
      topics: collectTopics(h.n + 1, end),
    });
    claimedLines.add(h.n);
  });
  return sections;
}

/** Ordered-list sections, where each numbered item *is* the syllabus line. */
function prelimsOrdered(from, to) {
  const sections = [];
  for (let n = from; n <= to; n += 1) {
    const line = lines[n - 1];
    if (!isOrdered(line)) continue;
    const number = line.match(/^\s*(\d+)\./)[1];
    sections.push({ number, title: orderedText(line), line: n, page: pageAt[n - 1], topics: [], leaf: true });
    claimedLines.add(n);
  }
  return sections;
}

/* --------------------------------------------------------- mains --------- */

function mainsOutline(from, to) {
  const papers = [];
  let paper = null;
  let part = null;
  let unit = null;
  let group = null;

  const flushUnit = () => { if (part && unit) part.units.push(unit); unit = null; group = null; };
  const flushPart = () => { flushUnit(); if (paper && part) paper.parts.push(part); part = null; };
  const flushPaper = () => { flushPart(); if (paper) papers.push(paper); paper = null; };

  for (let n = from; n <= to; n += 1) {
    const line = lines[n - 1];
    if (line === undefined || isBlank(line)) continue;

    const mk = markerText(line);
    if (mk) {
      const t = mk;
      const page = pageAt[n - 1];

      const paperMatch =
        t.match(/^(प्रथम|द्वितीय|तृतीय|चतुर्थ|पंचम|षष्ठ)\s*प्रश्न[-\s]?पत्र/) ||
        t.match(/^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+PAPER$/i);
      if (paperMatch) {
        const hiMap = { प्रथम: 'I', द्वितीय: 'II', तृतीय: 'III', चतुर्थ: 'IV', पंचम: 'V', षष्ठ: 'VI' };
        const enMap = { FIRST: 'I', SECOND: 'II', THIRD: 'III', FOURTH: 'IV', FIFTH: 'V', SIXTH: 'VI' };
        const num = hiMap[paperMatch[1]] || enMap[paperMatch[1].toUpperCase()] || paperMatch[1].toUpperCase();
        const existing = papers.find((p) => p.number === num) || (paper && paper.number === num ? paper : null);
        if (existing) {
          // The source repeats the paper banner before each part; continue it.
          if (paper && paper.number === num) { flushPart(); paper = null; }
          paper = existing;
        } else {
          flushPaper();
          paper = { number: num, line: n, page, title: t, parts: [], bannerLines: [] };
        }
        continue;
      }

      const partMatch = t.match(/^खण्ड[-\s]*\(?([अब])\)?/) || t.match(/^(?:PART|Part)\s*[-\s]*\(?([AB])\)?/);
      if (partMatch && paper) {
        flushPart();
        const letter = partMatch[1].toUpperCase();
        const side = letter === 'A' || letter === 'अ' ? 'a' : 'b';
        const title = t
          .replace(/^खण्ड[-\s]*\(?[अब]\)?[-\s]*/, '')
          .replace(/^(?:PART|Part)\s*[-\s]*\(?[AB]\)?[-\s]*/, '')
          .trim();
        const existing = paper.parts.find((p) => p.side === side);
        if (existing) {
          // Repeated part banner (the source re-states it after a page break).
          part = existing;
        } else {
          part = { side, line: n, page, title: title || null, units: [] };
        }
        continue;
      }

      const unitMatch =
        t.match(/^इकाई[-\s]*(\d+)\s*(.*)$/) ||
        t.match(/^UNIT[-\s]*([IVX]+)\s*(.*)$/i) ||
        t.match(/^Unit[-\s]*([IVX]+)\s*(.*)$/);
      if (unitMatch && part) {
        const raw = unitMatch[1];
        const idx = /^\d+$/.test(raw) ? Number(raw) : romanToInt(raw);
        const title = (unitMatch[2] || '').replace(/^[-–—:\s]+/, '').trim();
        flushUnit();
        const existing = part.units.find((u) => u.number === idx);
        if (existing) {
          unit = existing;
        } else {
          unit = { number: idx, line: n, page, title: title || null, topics: [], groups: [] };
        }
        continue;
      }

      if (unit && /गणितीय विज्ञान|Mathematical Science/i.test(t)) {
        group = { title: t, line: n, page, topics: [] };
        unit.groups.push(group);
        continue;
      }
      continue;
    }

    // Content line: belongs to the open group, else the open unit.
    const target = group || unit;
    if (!target) continue;
    if (isBullet(line)) { target.topics.push(topicFrom(bulletText(line), n)); claimedLines.add(n); }
    else if (isOrdered(line)) { target.topics.push(topicFrom(orderedText(line), n)); claimedLines.add(n); }
  }
  flushPaper();
  return papers;
}

/* ------------------------------------------- Paper V / VI (table-based) --- */

function tableRows(from, to) {
  const rows = [];
  for (let n = from; n <= to; n += 1) {
    const line = lines[n - 1];
    if (!isTableRow(line)) continue;
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // separator
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    rows.push({ cells, line: n, page: pageAt[n - 1] });
    claimedLines.add(n);
  }
  return rows;
}

/** Paper V: one curriculum row per category; the marks column is dropped. */
function buildPaperFive(from, to) {
  const units = [];
  for (const row of tableRows(from, to)) {
    const curriculum = row.cells[0];
    if (!curriculum || /अंकों का कुल योग/.test(curriculum) || /^विवरण/.test(normaliseTopic(curriculum))) continue;
    const category = normaliseTopic(curriculum).match(/^\(([क-ह])\)\s*(.*)$/);
    if (!category) continue;
    const body = category ? category[2] : normaliseTopic(curriculum);
    if (!body) continue;
    const parts = body
      .split(/<br\s*\/?>/i)
      .map((p) => stripMarksPlan(p))
      .filter(Boolean)
      .filter((p) => !/^\(\s*(लगभग|यथा)[^)]*\)$/.test(p)); // a word-count note is not curriculum
    const [head, ...rest] = parts;
    if (!head) continue;
    units.push({
      marker: category ? category[1] : null,
      title: head,
      line: row.line,
      page: row.page,
      topics: rest.map((text) => ({ text, line: row.line, page: row.page })),
      groups: [],
      rawCell: curriculum,
    });
  }
  return units;
}

/** Paper VI: four curriculum rows; the marks column is dropped. */
function buildPaperSix(from, to) {
  const units = [];
  for (const row of tableRows(from, to)) {
    const curriculum = row.cells[0];
    if (!curriculum || /^योग/.test(normaliseTopic(curriculum)) || /^विवरण/.test(normaliseTopic(curriculum))) continue;
    const numbered = normaliseTopic(curriculum).match(/^(\d+)\.\s*(.*)$/);
    if (!numbered) continue;
    const parts = numbered[2]
      .split(/<br\s*\/?>/i)
      .map((p) => stripMarksPlan(p))
      .filter(Boolean)
      .filter((p) => !/^\(\s*(लगभग|यथा)[^)]*\)$/.test(p)); // a word-count note is not curriculum
    const [head, ...rest] = parts;
    if (!head) continue;
    units.push({
      marker: numbered[1],
      title: head,
      line: row.line,
      page: row.page,
      topics: rest.map((text) => ({ text, line: row.line, page: row.page })),
      groups: [],
      rawCell: curriculum,
    });
  }
  return units;
}

/** Verifies the derived Paper V/VI text only ever deletes from the source cell. */
function verifyDerivedFromCell(label, units) {
  for (const unit of units) {
    // The cell is compared after the same deletions, so "derived" can only
    // ever mean "a part of this cell".
    const haystack = stripMarksPlan(unit.rawCell.replace(/<br\s*\/?>/gi, ' '));
    for (const fragment of [unit.title, ...unit.topics.map((t) => t.text)]) {
      if (!haystack.includes(fragment)) {
        problems.push(`${label}: derived text "${fragment.slice(0, 60)}" is not a substring of its source cell`);
      }
    }
  }
}

/* --------------------------------------------------------------- build --- */

const PRELIMS_REGIONS = [
  { paper: 'paper-1', lang: 'hi', from: 74, to: 179, kind: 'heading' },
  { paper: 'paper-1', lang: 'en', from: 197, to: 273, kind: 'heading' },
  { paper: 'paper-2', lang: 'hi', from: 182, to: 196, kind: 'ordered' },
  { paper: 'paper-2', lang: 'en', from: 274, to: 291, kind: 'ordered' },
];

const PRELIMS_PAPER_TITLES = {
  'paper-1': { hi: 'प्रथम प्रश्न पत्र- सामान्य अध्ययन', en: 'PAPER-I GENERAL STUDIES' },
  'paper-2': { hi: 'द्वितीय प्रश्न पत्र- सामान्य अभिरुचि परीक्षण', en: 'PAPER-II GENERAL APTITUDE TEST' },
};

const prelimsRaw = { 'paper-1': {}, 'paper-2': {} };
for (const region of PRELIMS_REGIONS) {
  prelimsRaw[region.paper][region.lang] =
    region.kind === 'ordered'
      ? prelimsOrdered(region.from, region.to)
      : prelimsHeadings(region.from, region.to);
}

// English Prelims Paper I resumes mid-way through section 3 (page 8 is absent
// from the source), so the leading unnumbered bullets are section 3's English
// tail rather than a section of their own.
{
  const numberedHeadings = [];
  for (let n = 197; n <= 273; n += 1) {
    if (isHeading(lines[n - 1]) && /^\d+\./.test(headingText(lines[n - 1]))) numberedHeadings.push(n);
  }
  const firstHeading = numberedHeadings.length ? numberedHeadings[0] : 274;
  const tail = collectTopics(197, firstHeading - 1);
  if (tail.length) {
    const s3 = prelimsRaw['paper-1'].en.find((s) => s.number === '3');
    if (s3) {
      s3.topics = tail;
      s3.partial = true;
    } else {
      prelimsRaw['paper-1'].en.push({ number: '3', title: null, line: 199, page: 9, topics: tail, partial: true });
    }
  }
}

/** Merges a Hindi and English rendition of the same section into one node. */
function mergePrelimsSections(paperId, hiSections, enSections) {
  const out = [];
  const enByNumber = new Map(enSections.map((s) => [s.number, s]));
  const allNumbers = [...new Set([...hiSections.map((s) => s.number), ...enSections.map((s) => s.number)])].sort(
    (a, b) => Number(a) - Number(b),
  );
  for (const number of allNumbers) {
    const hi = hiSections.find((s) => s.number === number) || null;
    const en = enByNumber.get(number) || null;
    const id = `prelims/${paperId}/s${number}`;
    const leaf = Boolean(hi?.leaf || en?.leaf);
    const topicCount = Math.max(hi?.topics.length || 0, en?.topics.length || 0);

    // Hindi and English are paired index-for-index when the lists match in
    // length. Where the English rendition is a tail (page 8 of the source is
    // absent) the pairing is anchored to the end of the Hindi list. Otherwise
    // the two renditions are listed side by side and never paired by guesswork.
    const pairs = [];
    const hiTopics = hi?.topics || [];
    const enTopics = en?.topics || [];
    if (hiTopics.length === enTopics.length && hiTopics.length > 0) {
      hiTopics.forEach((t, i) => pairs.push([t, enTopics[i]]));
    } else if (en?.partial && enTopics.length > 0 && hiTopics.length >= enTopics.length) {
      const offset = hiTopics.length - enTopics.length;
      hiTopics.forEach((t, i) => pairs.push([t, i >= offset ? enTopics[i - offset] : null]));
    } else {
      const count = Math.max(hiTopics.length, enTopics.length);
      for (let i = 0; i < count; i += 1) pairs.push([hiTopics[i] || null, enTopics[i] || null]);
      if (hi && en && !leaf && hiTopics.length !== enTopics.length) {
        warnings.push(
          `${id}: renditions differ in length (hi ${hiTopics.length}, en ${enTopics.length}) — listed side by side, not paired`,
        );
      }
    }

    const topics = pairs.map(([hiTopic, enTopic], i) => ({
      id: `${id}/t${i + 1}`,
      text: { hi: hiTopic?.text || null, en: enTopic?.text || null },
      src: {
        hi: hiTopic ? { line: hiTopic.line, page: hiTopic.page } : null,
        en: enTopic ? { line: enTopic.line, page: enTopic.page } : null,
      },
    })).filter((node) => node.text.hi || node.text.en);

    out.push({
      id,
      number,
      titles: { hi: hi?.title || null, en: en?.title || null },
      scope: null,
      leaf,
      src: {
        hi: hi ? { line: hi.line, page: hi.page } : null,
        en: en ? { line: en.line, page: en.page } : null,
      },
      topics,
    });
  }
  return out;
}

const prelims = {
  id: 'prelims',
  titles: {
    hi: 'राज्य सेवा एवं राज्य वन सेवा (प्रारंभिक) परीक्षा-2026',
    en: 'State Service and State Forest Service (Preliminary) Exam-2026',
  },
  papers: ['paper-1', 'paper-2'].map((paperId) => ({
    id: `prelims/${paperId}`,
    code: paperId,
    titles: PRELIMS_PAPER_TITLES[paperId],
    sections: mergePrelimsSections(paperId, prelimsRaw[paperId].hi || [], prelimsRaw[paperId].en || []),
  })),
};

/* ---- mains ---- */

const mainsHi = mainsOutline(360, 763);
const mainsEn = mainsOutline(764, 1123);

// Papers V and VI are table-driven and Hindi-medium only.
{
  const paperFive = mainsHi.find((p) => p.number === 'V');
  if (paperFive) {
    const units = buildPaperFive(724, 747);
    verifyDerivedFromCell('mains Paper V', units);
    paperFive.parts = [
      {
        side: null,
        line: null,
        page: 30,
        title: 'सामान्य हिन्दी एवं व्याकरण',
        scope: normaliseTopic(lines[729] || ''),
        units,
      },
    ];
  } else {
    problems.push('mains Paper V banner was not found');
  }

  const paperSix = mainsHi.find((p) => p.number === 'VI');
  if (paperSix) {
    const units = buildPaperSix(748, 762);
    verifyDerivedFromCell('mains Paper VI', units);
    paperSix.parts = [
      { side: null, line: null, page: 31, title: 'हिन्दी निबंध एवं प्रारूप लेखन', scope: null, units },
    ];
  } else {
    problems.push('mains Paper VI banner was not found');
  }
}

const mains = {
  id: 'mains',
  titles: { hi: 'राज्य सेवा मुख्य परीक्षा-2026', en: 'State Service Mains Examination 2026' },
  papers: mainsHi.map((hiPaper) => {
    const enPaper = mainsEn.find((p) => p.number === hiPaper.number) || null;
    const parts = [];
    const sides = [...new Set([...hiPaper.parts.map((p) => p.side), ...(enPaper?.parts || []).map((p) => p.side)])];
    sides.sort((a, b) => String(a).localeCompare(String(b)));
    for (const side of sides) {
      const hiPart = hiPaper.parts.find((p) => p.side === side) || null;
      const enPart = (enPaper?.parts || []).find((p) => p.side === side) || null;
      const partId = side ? `mains/paper-${hiPaper.number}/part-${side}` : `mains/paper-${hiPaper.number}/part`;
      const numbers = [
        ...new Set([...(hiPart?.units || []).map((u) => u.number), ...(enPart?.units || []).map((u) => u.number)]),
      ].sort((a, b) => a - b);
      const units = numbers.map((number) => {
        const hiUnit = (hiPart?.units || []).find((u) => u.number === number) || null;
        const enUnit = (enPart?.units || []).find((u) => u.number === number) || null;
        const unitId = `${partId}/unit-${number}`;
        const hiTopics = hiUnit?.topics || [];
        const enTopics = enUnit?.topics || [];
        const count = Math.max(hiTopics.length, enTopics.length);
        const topics = [];
        for (let i = 0; i < count; i += 1) {
          const hiTopic = hiTopics[i] || null;
          const enTopic = enTopics[i] || null;
          if (!hiTopic && !enTopic) continue;
          topics.push({
            id: `${unitId}/t${i + 1}`,
            text: { hi: hiTopic?.text || null, en: enTopic?.text || null },
            src: {
              hi: hiTopic ? { line: hiTopic.line, page: hiTopic.page } : null,
              en: enTopic ? { line: enTopic.line, page: enTopic.page } : null,
            },
          });
        }
        const groups = [];
        if (hiUnit) {
          (hiUnit.groups || []).forEach((g, gi) => {
            const enGroup = enUnit?.groups?.[gi] || null;
            const gCount = Math.max(g.topics.length, enGroup?.topics.length || 0);
            const gTopics = [];
            for (let i = 0; i < gCount; i += 1) {
              const hiTopic = g.topics[i] || null;
              const enTopic = enGroup?.topics[i] || null;
              if (!hiTopic && !enTopic) continue;
              gTopics.push({
                id: `${unitId}/g${gi + 1}/t${i + 1}`,
                text: { hi: hiTopic?.text || null, en: enTopic?.text || null },
                src: {
                  hi: hiTopic ? { line: hiTopic.line, page: hiTopic.page } : null,
                  en: enTopic ? { line: enTopic.line, page: enTopic.page } : null,
                },
              });
            }
            groups.push({
              id: `${unitId}/g${gi + 1}`,
              titles: { hi: g.title || null, en: enGroup?.title || null },
              topics: gTopics,
              src: { hi: { line: g.line, page: g.page }, en: enGroup ? { line: enGroup.line, page: enGroup.page } : null },
            });
          });
        }
        if (hiUnit && enUnit && hiUnit.topics.length !== enUnit.topics.length) {
          warnings.push(
            `${unitId}: renditions differ in length (hi ${hiUnit.topics.length}, en ${enUnit.topics.length})`,
          );
        }
        return {
          id: unitId,
          number,
          titles: { hi: hiUnit?.title || null, en: enUnit?.title || null },
          scope: null,
          topics,
          groups,
          src: {
            hi: hiUnit ? { line: hiUnit.line, page: hiUnit.page } : null,
            en: enUnit ? { line: enUnit.line, page: enUnit.page } : null,
          },
        };
      });
      const plainUnits = side
        ? units
        : (hiPart?.units || []).map((u, i) => ({
            id: `${partId}/unit-${i + 1}`,
            number: i + 1,
            marker: u.marker,
            titles: { hi: u.title || null, en: null },
            scope: null,
            topics: u.topics.map((t, ti) => ({
              id: `${partId}/unit-${i + 1}/t${ti + 1}`,
              text: { hi: t.text, en: null },
              src: { hi: { line: t.line, page: t.page }, en: null },
            })),
            groups: [],
            src: { hi: { line: u.line, page: u.page }, en: null },
          }));
      parts.push({
        id: partId,
        side,
        titles: { hi: hiPart?.title || null, en: enPart?.title || null },
        scope: hiPart?.scope || null,
        units: plainUnits,
        src: {
          hi: hiPart?.line ? { line: hiPart.line, page: hiPart.page } : null,
          en: enPart?.line ? { line: enPart.line, page: enPart.page } : null,
        },
      });
    }
    return {
      id: `mains/paper-${hiPaper.number}`,
      number: hiPaper.number,
      titles: {
        hi: hiPaper.title,
        en: mainsEn.find((p) => p.number === hiPaper.number)?.title || null,
      },
      banner: hiPaper.bannerLines || null,
      parts,
      src: { hi: { line: hiPaper.line, page: hiPaper.page }, en: null },
    };
  }),
};

for (const enPaper of mainsEn) {
  if (!mainsHi.some((p) => p.number === enPaper.number)) {
    warnings.push(`mains Paper ${enPaper.number}: present in English only`);
  }
}

/* --------------------------------------------------------------- notes --- */

const pagesPresent = [];
for (let n = 1; n <= 47; n += 1) if (lines.some((l) => l.trim() === `# Page ${n}`)) pagesPresent.push(n);
const pagesMissing = [];
for (let n = 1; n <= 47; n += 1) if (!pagesPresent.includes(n)) pagesMissing.push(n);

notes.push({
  id: 'source-pages-missing',
  kind: 'source-gap',
  text: {
    en: `Page ${pagesMissing.join(', ')} of the source document are absent, so the English wording of Prelims Paper I subjects 1-2 (and most of subject 3), the Hindi wording of Mains Paper II Part A Unit 5, and the English wording of Mains Paper IV Part A Units 4-5 are not available in this file. Nothing was invented to fill them.`,
    hi: null,
  },
  affected: ['prelims/paper-1/s1', 'prelims/paper-1/s2', 'prelims/paper-1/s3', 'mains/paper-2/part-a/unit-5', 'mains/paper-4/part-a/unit-4', 'mains/paper-4/part-a/unit-5'],
});
notes.push({
  id: 'marks-plan-omitted',
  kind: 'scope',
  text: {
    en: 'Examination administration — the notification, both exam plans, marks, durations, qualifying percentages and negative marking — is deliberately not part of this module. Where a Paper V or Paper VI table row mixed curriculum with a marks plan, the curriculum was kept and the marks annotation removed.',
    hi: null,
  },
  affected: ['mains/paper-5', 'mains/paper-6'],
});
notes.push({
  id: 'ocr-artefacts',
  kind: 'transcription',
  text: {
    en: 'The source is an OCR transcription that retains its original typing, spelling and punctuation (for example "Knowlegde", "Diagonosis", "Populatin", "Scenerio"). Only transcription artefacts were normalised; the wording itself was left untouched, including typos.',
    hi: null,
  },
  affected: [],
});
notes.push({
  id: 'prelims-paper-2-header',
  kind: 'transcription',
  text: {
    en: 'The source heading for Prelims Paper II reads "…(प्रारंभिक) परीक्षा-2020", which appears to be a transcription slip for 2026; the syllabus beneath it is the revised Paper II issued with the 21.01.2026 notification.',
    hi: null,
  },
  affected: ['prelims/paper-2'],
});
notes.push({
  id: 'paper-v-vi-language',
  kind: 'scope',
  text: {
    en: 'Mains Paper V and Paper VI are Hindi-medium papers, so the source documents them in Hindi only. They are shown as they are; no English rendition exists to show.',
    hi: null,
  },
  affected: ['mains/paper-5', 'mains/paper-6'],
});

/* ---------------------------------------------------------- assertions --- */

for (const region of [...PRELIMS_REGIONS, { id: 'mains-hi', from: 360, to: 763 }, { id: 'mains-en', from: 764, to: 1123 }]) {
  for (let n = region.from; n <= region.to; n += 1) {
    if (!contentLineIndexes.has(n) || claimedLines.has(n)) continue;
    problems.push(`${region.id}: line ${n} was not assigned to any node — "${lines[n - 1].trim().slice(0, 70)}"`);
  }
}

const countTopics = (node) => (node.topics || []).length + (node.groups || []).reduce((a, g) => a + g.topics.length, 0);

// No marks annotation may survive into the extracted syllabus, and no marks
// column may be mistaken for curriculum.
const MARKS_ANNOTATION = /[\d०-९]\s*अंक/;
const scanForMarks = (node, where) => {
  const texts = [
    node.titles?.hi, node.titles?.en, node.title,
    ...(node.topics || []).map((t) => t.text?.hi).filter(Boolean),
    ...(node.topics || []).map((t) => t.text?.en).filter(Boolean),
    ...(node.groups || []).flatMap((g) => g.topics.map((t) => t.text?.hi).filter(Boolean)),
    ...(node.units || []).flatMap((u) => [u.titles?.hi, u.titles?.en].filter(Boolean)),
  ].filter((t) => typeof t === 'string');
  for (const text of texts) {
    if (MARKS_ANNOTATION.test(text)) problems.push(`${where}: a marks annotation survived extraction — "${text.slice(0, 80)}"`);
  }
};
for (const exam of [prelims, mains]) {
  for (const paper of exam.papers) {
    scanForMarks(paper, paper.id);
    for (const part of paper.parts || []) {
      for (const unit of part.units || []) scanForMarks(unit, unit.id || unit.title);
    }
  }
}

const official = {
  format: 'mymppsc-syllabus',
  format_version: '1.0.0',
  exam: {
    year: 2026,
    body: 'Madhya Pradesh Public Service Commission (MPPSC)',
    notification_date: '2026-01-21',
    source_title: 'Revised exam plan and syllabus',
    stages: ['prelims', 'mains'],
  },
  source: {
    file: 'data/MPPSC 2026 Syllabus.md',
    sha256: sourceSha,
    pages_present: pagesPresent,
    pages_missing: pagesMissing,
    language_renditions: {
      prelims: 'The source gives the whole prelims syllabus in Hindi and in English.',
      mains: 'The source gives Mains Papers I-IV in Hindi and in English; Papers V and VI are Hindi-medium and appear in Hindi only.',
    },
  },
  extraction_notes: notes,
  exams: [
    {
      id: 'prelims',
      titles: prelims.titles,
      papers: prelims.papers.map((paper) => ({
        ...paper,
        counts: {
          sections: paper.sections.length,
          topics: paper.sections.reduce((a, s) => a + countTopics(s), 0),
        },
      })),
    },
    {
      id: 'mains',
      titles: mains.titles,
      papers: mains.papers.map((paper) => ({
        ...paper,
        counts: {
          parts: paper.parts.length,
          units: paper.parts.reduce((a, p) => a + p.units.length, 0),
          topics: paper.parts.reduce((a, p) => a + p.units.reduce((b, u) => b + countTopics(u), 0), 0),
        },
      })),
    },
  ],
  counts: {
    prelims_papers: prelims.papers.length,
    prelims_sections: prelims.papers.reduce((a, p) => a + p.sections.length, 0),
    prelims_topics: prelims.papers.reduce((a, p) => a + p.sections.reduce((b, s) => b + s.topics.length, 0), 0),
    mains_papers: mains.papers.length,
    mains_parts: mains.papers.reduce((a, p) => a + p.parts.length, 0),
    mains_units: mains.papers.reduce((a, p) => a + p.parts.reduce((b, q) => b + q.units.length, 0), 0),
    mains_topics: mains.papers.reduce(
      (a, p) => a + p.parts.reduce((b, q) => b + q.units.reduce((c, u) => c + countTopics(u), 0), 0),
      0,
    ),
  },
};

/* ------------------------------------------------------------ guide check -- */

/**
 * The node index the app builds in `js/services/syllabus.js` -> `buildModel`,
 * reduced to what the study-guide check needs: every node id, its official text
 * and its children. Guide units are resolved against the leaves *inside their
 * own heading*, exactly as the runtime resolves them, so a prefix that also
 * occurs in another paper is not a false failure here.
 */
function buildOfficialIndex() {
  const index = new Map();
  const node = (id, text, children = []) => {
    const entry = { id, text, children };
    index.set(id, entry);
    return entry;
  };
  const topicNodes = (topics) => (topics || []).map((t) => node(t.id, t.text?.hi || t.text?.en || ''));

  for (const exam of official.exams) {
    const examNode = node(exam.id, '');
    for (const paper of exam.papers) {
      const paperNode = node(paper.id, '');
      for (const section of paper.sections || []) {
        const kids = section.topics?.length
          ? topicNodes(section.topics)
          : [];
        const sectionNode = node(section.id, section.titles?.hi || section.titles?.en || '', kids);
        paperNode.children.push(sectionNode);
      }
      for (const part of paper.parts || []) {
        const partNode = node(part.id, '');
        for (const unit of part.units || []) {
          const kids = [];
          for (const group of unit.groups || []) {
            kids.push(node(group.id, group.titles?.hi || group.titles?.en || '', topicNodes(group.topics)));
          }
          kids.push(...topicNodes(unit.topics));
          const unitNode = node(unit.id, unit.titles?.hi || unit.titles?.en || '', kids);
          partNode.children.push(unitNode);
        }
        paperNode.children.push(partNode);
      }
      examNode.children.push(paperNode);
    }
  }

  const leavesOf = (id) => {
    const entry = index.get(id);
    if (!entry) return [];
    if (!entry.children.length) return [entry];
    return entry.children.flatMap((child) => leavesOf(child.id));
  };

  return { index, leavesOf };
}

/**
 * Validates every study-guide file against the extracted syllabus. A guide unit
 * that cannot be traced to exactly one official line is a build failure: the
 * study guidance may subdivide or group the official text, never add to it.
 */
async function validateGuides() {
  const { index, leavesOf } = buildOfficialIndex();
  const ids = new Set(index.keys());
  const allLeaves = [...index.values()].filter((node) => !node.children.length);
  const files = (await readdir(GUIDE_DIR)).filter((f) => f.endsWith('.json')).sort();
  const report = [];
  const localProblems = [];

  const headingsWithGuides = new Set();
  const coveredLeaves = new Set();

  for (const file of files) {
    const guide = JSON.parse(await readFile(path.join(GUIDE_DIR, file), 'utf8'));
    if (guide.format !== 'mymppsc-syllabus-study-guide') {
      localProblems.push(`${file}: unexpected format "${guide.format}"`);
    }
    const where = (bit) => `${file}${bit ? `: ${bit}` : ''}`;
    let units = 0;
    for (const [nodeId, entry] of Object.entries(guide.headings || {})) {
      if (!ids.has(nodeId)) {
        localProblems.push(where(`heading "${nodeId}" is not a node in the extracted syllabus`));
        continue;
      }
      headingsWithGuides.add(nodeId);
      const leaves = leavesOf(nodeId);
      for (const unit of entry.units || []) {
        units += 1;
        const matched = [];
        for (const prefix of unit.match || []) {
          const hits = leaves.filter((leaf) => leaf.text.startsWith(prefix));
          if (hits.length === 1) matched.push(hits[0]);
          else {
            localProblems.push(
              where(
                `unit "${unit.title}" in ${nodeId}: match prefix "${prefix}" ${
                  hits.length ? `matched ${hits.length} official lines` : 'matched no official line in this heading'
                }`,
              ),
            );
          }
        }
        if (!matched.length) {
          localProblems.push(where(`unit "${unit.title}" in ${nodeId}: no official line matched, so the unit would render as untraceable guidance`));
        }
        for (const fragment of unit.split || []) {
          const hosts = matched.filter((leaf) => leaf.text.includes(fragment));
          if (hosts.length === 0) {
            localProblems.push(where(`unit "${unit.title}" in ${nodeId}: split fragment "${fragment}" is not part of any matched official line`));
          } else if (hosts.length > 1) {
            warnings.push(`${file}: split fragment "${fragment}" appears in ${hosts.length} matched lines for unit "${unit.title}"`);
          }
          hosts.forEach((host) => coveredLeaves.add(host.id));
        }
        matched.forEach((leaf) => coveredLeaves.add(leaf.id));
      }
    }
    for (const connection of guide.connections || []) {
      for (const ref of [connection.a, connection.b]) {
        if (!ids.has(ref)) localProblems.push(where(`connection refers to "${ref}", which is not a node in the extracted syllabus`));
      }
    }
    for (const group of guide.revisionGroups || []) {
      for (const ref of group.nodes || []) {
        if (!ids.has(ref)) localProblems.push(where(`revision group "${group.title}" refers to "${ref}", which is not a node in the extracted syllabus`));
      }
    }
    report.push(`${file}: headings=${Object.keys(guide.headings || {}).length} units=${units}`);
  }

  // Coverage the module promises: every paper, and every section that groups
  // official lines, must carry a study breakdown. Prelims Paper II is an
  // already-itemised list of skills, so its paper-level breakdown covers it.
  const required = [];
  for (const exam of official.exams) {
    for (const paper of exam.papers) {
      required.push(paper.id);
      for (const section of paper.sections || []) {
        if (section.topics?.length) required.push(section.id);
      }
    }
  }
  for (const id of required) {
    if (!headingsWithGuides.has(id)) localProblems.push(`study guide missing: ${id} has no study breakdown`);
  }

  return { report, problems: localProblems, coveredLeaves: coveredLeaves.size, leaves: allLeaves.length };
}

if (checkGuide) {
  const result = await validateGuides();
  problems.push(...result.problems);
  result.report.forEach((line) => console.log(line));
  console.log(`guide coverage: ${result.coveredLeaves} of ${result.leaves} official leaf lines are referenced by a study unit`);
  console.log(`problems (${problems.length}):`);
  problems.forEach((p) => console.log('  ! ' + p));
  if (warnings.length) {
    console.log(`warnings (${warnings.length}):`);
    warnings.forEach((w) => console.log('  - ' + w));
  }
  process.exit(problems.length ? 1 : 0);
}

if (reportOnly) {
  const line = (s) => console.log(s);
  line(`source sha256 : ${sourceSha}`);
  line(`pages missing : ${pagesMissing.join(', ')}`);
  line(`counts        : ${JSON.stringify(official.counts)}`);
  line('');
  for (const exam of official.exams) {
    line(`== ${exam.id} ==`);
    for (const paper of exam.papers) {
      line(`  ${paper.id}  ${exam.id === 'mains' ? `parts=${paper.parts.length}` : `sections=${paper.sections.length}`}`);
      if (exam.id === 'prelims') {
        for (const s of paper.sections) {
          line(`    s${s.number} hi=${s.topics.filter((t) => t.text.hi).length} en=${s.topics.filter((t) => t.text.en).length} leaf=${!!s.leaf} :: ${(s.titles.hi || s.titles.en || '').slice(0, 60)}`);
        }
      } else {
        for (const part of paper.parts) {
          line(`    part-${part.side ?? 'only'} (${part.units.length} units) ${(part.titles.hi || part.titles.en || '').slice(0, 46)}`);
          for (const u of part.units) {
            line(`      unit-${u.number} hi=${u.topics.filter((t) => t.text.hi).length} en=${u.topics.filter((t) => t.text.en).length} groups=${u.groups.length} :: ${(u.titles.hi || u.titles.en || '').slice(0, 44)}`);
          }
        }
      }
    }
  }
  line('');
  line(`warnings (${warnings.length}):`);
  warnings.forEach((w) => line('  - ' + w));
  line(`problems (${problems.length}):`);
  problems.forEach((p) => line('  ! ' + p));
  process.exit(problems.length ? 1 : 0);
}

if (problems.length) {
  console.error('Syllabus extraction failed:');
  problems.forEach((p) => console.error('  ! ' + p));
  process.exit(1);
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(official, null, 2) + '\n', 'utf8');
console.log(`Wrote ${path.relative(root, OUT)}`);
console.log(`  source sha256 : ${sourceSha}`);
console.log(`  ${JSON.stringify(official.counts)}`);
if (warnings.length) {
  console.log(`  warnings (${warnings.length}):`);
  warnings.forEach((w) => console.log('    -', w));
}
