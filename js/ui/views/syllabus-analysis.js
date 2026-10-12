/**
 * syllabus-analysis.js (view) — the official MPPSC 2026 syllabus.
 *
 * This screen renders the syllabus and nothing else. No counts, no marks, no
 * scores, no predictions: the tree is the commission's own hierarchy and the
 * detail panel is the commission's own wording. Derived study guidance is
 * labelled wherever it appears, and exam-administration content is not part of
 * this data at all.
 *
 * Progress is optional. Until something is marked, no status chrome appears —
 * the syllabus is fully readable without ever touching a status control.
 */

import {
  esc,
  toast,
  confirmDialog,
  notice,
  emptyState,
  progressBar,
  icon,
  langAttr,
} from '../components.js';
import {
  loadSyllabus,
  loadProgress,
  setProgressStatus,
  resetProgress,
  progressSummary,
  progressForNode,
  searchSyllabus,
  pickText,
  displayLanguage,
  pyqLinksFor,
  relatedGuidance,
  sourceRefs,
  ancestorsOf,
  leavesOf,
  EXAM_LABELS,
} from '../../services/syllabus.js';

/* ------------------------------------------------------------- view state -- */

const viewState = {
  examId: 'prelims',
  paperId: null,
  selectedId: null,
  expanded: new Set(),
  collapsed: new Set(),
  search: '',
  showAbout: false,
  appliedRoute: null,
};

const STATUS_ORDER = ['not_started', 'in_progress', 'completed', 'revised'];

const STATUS_TITLE = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  revised: 'Revised',
};

/* ---------------------------------------------------------------- helpers -- */

/**
 * The official title of a node, or a structural name when the source leaves it
 * untitled (several Mains units are bare "इकाई-N"). A structural name is never
 * syllabus text: it only says which numbered unit the row is.
 */
function label(node) {
  if (!node) return '';
  const official = pickText(node.titles);
  if (official) return official;
  if (node.kind === 'unit') return node.number ? `Unit ${node.number}` : 'Unit';
  if (node.kind === 'part') return node.side ? `Part ${node.side.toUpperCase()}` : 'This paper';
  if (node.kind === 'paper') return node.number ? `Paper ${node.number}` : 'Paper';
  return '';
}

/** True when the row's text is a structural name rather than official wording. */
const isStructural = (node) => Boolean(node) && !pickText(node.titles);

const dot = (status) =>
  status && status !== 'not_started'
    ? `<span class="syl-dot ${esc(status)}" role="img" aria-label="${esc(STATUS_TITLE[status])}" title="${esc(STATUS_TITLE[status])}"></span>`
    : '';

const statusOf = (progressRows, id) => progressRows.get(id)?.status || 'not_started';

/** A language block: the display language first, the other rendition after it. */
function renditions(pair) {
  if (!pair) return '';
  const first = displayLanguage();
  const order = [first, first === 'hi' ? 'en' : 'hi'].filter((lang) => pair[lang]);
  return order
    .map((lang, index) => {
      const secondary = index > 0;
      return `<p class="syl-said${secondary ? ' alt' : ''}"${langAttr(pair[lang], lang)}>${
        secondary ? `<span class="syl-lang">${lang === 'hi' ? 'हिन्दी' : 'English'}</span>` : ''
      }${esc(pair[lang])}</p>`;
    })
    .join('');
}

function statusControl(nodeId, current, { compact = false } = {}) {
  const active = current || 'not_started';
  return `<div class="syl-status${compact ? ' compact' : ''}" role="group" aria-label="Progress for this item">
    ${STATUS_ORDER.map(
      (status) => `<button type="button" class="syl-status-btn${active === status ? ' on' : ''}" data-set-status="${esc(nodeId)}" data-status="${status}" aria-pressed="${active === status}">
        <span class="syl-status-mark ${status}" aria-hidden="true"></span><span class="syl-status-text">${STATUS_TITLE[status]}</span>
      </button>`,
    ).join('')}
  </div>`;
}

/* ------------------------------------------------------- detail: derived --- */

const guideFor = (model, headingId) => model.guide.get(headingId) || null;

function studyBreakdown(model, headingId, { highlightTopicId = null } = {}) {
  const entry = guideFor(model, headingId);
  if (!entry || (!entry.focus && !entry.units.length)) return '';
  return `
    <section class="syl-block syl-derived">
      <div class="syl-block-head">
        <h4>Study breakdown</h4>
        <span class="syl-tag" title="Guidance added by this app, not part of the commission's syllabus">derived</span>
      </div>
      <p class="syl-tag-note">Built from the official lines above. It groups or subdivides them; it adds no requirement.</p>
      ${entry.focus ? `<p class="syl-focus">${esc(entry.focus)}</p>` : ''}
      ${
        entry.units.length
          ? `<ul class="syl-units">${entry.units
              .map(
                (unit) =>
                  `<li class="syl-unit${unit.covers.includes(highlightTopicId) ? ' current' : ''}"><span class="syl-unit-title">${esc(unit.title)}</span>${
                    unit.note ? `<span class="syl-unit-note">${esc(unit.note)}</span>` : ''
                  }</li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </section>`;
}

/* ------------------------------------------------------- detail: PYQ links -- */

/**
 * Read-only links into the existing practice and analysis screens, from the
 * curated mapping only. No counts appear here, so an incomplete mapping can
 * never read as "no previous-year questions exist".
 */
function pyqBlock(model, nodeId) {
  const links = pyqLinksFor(model, nodeId);
  if (!links.length) return '';
  return `
    <section class="syl-block syl-links">
      <h4>Previous-year practice</h4>
      <div class="syl-chips">
        ${links
          .map(
            (link) =>
              `<a class="syl-chip" href="${esc(link.practiceHref)}"${langAttr(link.label)}>${esc(link.label)}</a>`,
          )
          .join('')}
      </div>
      <p class="syl-tag-note">Opens questions already classified in your bank. Nothing here changes the bank.</p>
    </section>`;
}

function relatedBlock(model, node) {
  const { connections, revisionGroups } = relatedGuidance(model, node);
  if (!connections.length && !revisionGroups.length) return '';
  return `
    <section class="syl-block syl-derived">
      <div class="syl-block-head"><h4>Related</h4><span class="syl-tag" title="Guidance added by this app, not part of the commission's syllabus">derived</span></div>
      <ul class="syl-related">
        ${connections
          .map((connection) => {
            const other = model.nodes.get(connection.otherId);
            return `<li><button type="button" class="syl-other" data-open="${esc(connection.otherId)}">${esc(label(other))}</button><span class="syl-unit-note">${esc(connection.note)}</span></li>`;
          })
          .join('')}
        ${revisionGroups
          .map(
            (group) =>
              `<li><span class="syl-unit-title">${esc(group.title)}</span><span class="syl-unit-note">${esc(group.note)}</span></li>`,
          )
          .join('')}
      </ul>
    </section>`;
}

/* --------------------------------------------------------------- detail ---- */

function detailPanel(model, node, progressRows) {
  const crumbs = ancestorsOf(model.nodes, node).map((ancestor) => label(ancestor)).filter(Boolean);
  const current = statusOf(progressRows, node.id);
  const progress = progressForNode(model, node, progressRows);
  const head = `
    <button type="button" class="syl-close" data-close-detail aria-label="Close">${icon('close', { size: 14 })}</button>
    <p class="syl-crumbs">${crumbs.map((crumb) => esc(crumb)).join('<span aria-hidden="true"> › </span>')}</p>
    <h3 class="syl-detail-title"${langAttr(isStructural(node) ? '' : label(node))}>${esc(label(node))}</h3>
    ${
      isStructural(node)
        ? '<p class="syl-tag-note">The notification lists this unit without a title of its own; its lines are below.</p>'
        : ''
    }`;

  if (node.kind === 'topic') {
    const heading = model.nodes.get(node.parentId);
    const units = heading ? (guideFor(model, heading.id)?.units || []).filter((unit) => unit.covers.includes(node.id)) : [];
    return `<div class="syl-detail">
      ${head}
      <section class="syl-block"><h4>Official wording</h4>${renditions(node.text)}</section>
      ${
        units.length
          ? `<section class="syl-block syl-derived">
              <div class="syl-block-head"><h4>In the study breakdown</h4><span class="syl-tag" title="Guidance added by this app">derived</span></div>
              <ul class="syl-units">${units
                .map(
                  (unit) =>
                    `<li class="syl-unit current"><span class="syl-unit-title">${esc(unit.title)}</span>${
                      unit.note ? `<span class="syl-unit-note">${esc(unit.note)}</span>` : ''
                    }</li>`,
                )
                .join('')}</ul>
            </section>`
          : ''
      }
      ${heading ? pyqBlock(model, heading.id) : ''}
      <section class="syl-block"><h4>Your progress</h4>${statusControl(node.id, current)}</section>
    </div>`;
  }

  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const grouped = children.filter((child) => child.kind === 'topic');
  const nested = children.filter((child) => child.kind !== 'topic');
  const pages = sourceRefs(model, node);

  return `<div class="syl-detail">
    ${head}
    ${node.scope ? `<p class="syl-scope"${langAttr(node.scope, 'hi')}>${esc(node.scope)}</p>` : ''}
    ${
      grouped.length || nested.length
        ? `<section class="syl-block">
            <h4>Official syllabus</h4>
            <ol class="syl-official">
              ${grouped.map((child) => `<li>${renditions(child.text)}</li>`).join('')}
              ${nested
                .map((child) => {
                  const topics = child.childIds.map((id) => model.nodes.get(id)).filter((kid) => kid && kid.kind === 'topic');
                  if (!topics.length) return `<li><span class="syl-official-head">${esc(label(child))}</span></li>`;
                  return `<li><span class="syl-official-head">${esc(label(child))}</span>${topics.map((topic) => renditions(topic.text)).join('')}</li>`;
                })
                .join('')}
            </ol>
          </section>`
        : ''
    }
    ${studyBreakdown(model, node.id)}
    ${pyqBlock(model, node.id)}
    ${relatedBlock(model, node)}
    <section class="syl-block">
      <h4>Your progress</h4>
      ${statusControl(node.id, current)}
      ${
        progress.total && progress.done + progress.inProgress > 0
          ? `<p class="syl-tag-note">${progress.done} of ${progress.total} item${progress.total === 1 ? '' : 's'} completed or revised here${
              progress.inProgress ? `, ${progress.inProgress} in progress` : ''
            }.</p>`
          : ''
      }
    </section>
    ${
      pages.length
        ? `<p class="syl-source">Official text from page${pages.length > 1 ? 's' : ''} ${pages.join(', ')} of the source notification.</p>`
        : ''
    }
  </div>`;
}

/* ----------------------------------------------------------------- tree ---- */

function isOpen(node, depth) {
  if (viewState.collapsed.has(node.id)) return false;
  if (viewState.expanded.has(node.id)) return true;
  // The first levels start open so the shape of a paper is visible at once.
  return depth < (node.kind === 'paper' ? 1 : 2);
}

function treeNode(model, node, progressRows, depth) {
  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const isLeaf = children.length === 0;
  const open = children.length > 0 && isOpen(node, depth);
  const status = statusOf(progressRows, node.id);
  const selected = node.id === viewState.selectedId;

  return `<li class="syl-node">
    <div class="syl-row${selected ? ' selected' : ''}">
      ${
        children.length
          ? `<button type="button" class="syl-caret${open ? ' open' : ''}" data-toggle="${esc(node.id)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(label(node))}"></button>`
          : '<span class="syl-caret spacer" aria-hidden="true"></span>'
      }
      <button type="button" class="syl-title${isLeaf ? ' leaf' : ''}${node.kind === 'topic' ? ' topic' : ''}" data-open="${esc(node.id)}" aria-current="${selected}">
        ${node.marker ? `<span class="syl-marker">(${esc(node.marker)})</span>` : ''}
        ${
          node.number && !node.marker && !isStructural(node)
            ? `<span class="syl-num">${esc(String(node.number))}.</span>`
            : ''
        }
        <span class="syl-text${isStructural(node) ? ' syl-structural' : ''}"${langAttr(isStructural(node) ? '' : label(node))}>${esc(label(node))}</span>
        ${isLeaf ? dot(status) : ''}
      </button>
      ${
        children.length && !open
          ? `<span class="syl-more" aria-hidden="true">${leavesOf(model.nodes, node).length}</span>`
          : ''
      }
    </div>
    ${open ? `<ul class="syl-children">${children.map((child) => treeNode(model, child, progressRows, depth + 1)).join('')}</ul>` : ''}
    ${selected ? `<div class="syl-detail-slot">${detailPanel(model, node, progressRows)}</div>` : ''}
  </li>`;
}

/* --------------------------------------------------------------- search ---- */

function searchResults(model, progressRows) {
  const results = searchSyllabus(model, viewState.search, { examId: viewState.examId, limit: 40 });
  if (!results.length) {
    return emptyState({
      title: 'No match',
      message: `Nothing in ${EXAM_LABELS[viewState.examId]} matches “${viewState.search}”.`,
    });
  }
  return `<div class="syl-results">
    <ul class="syl-result-list">
      ${results
        .map(
          (result) => `<li>
        <button type="button" class="syl-result" data-open="${esc(result.id)}">
          <span class="syl-result-text"${langAttr(result.label)}>${esc(result.label)}</span>
          <span class="syl-result-path">${result.path.map((step) => esc(step)).join(' › ')}</span>
          ${dot(statusOf(progressRows, result.id))}
        </button>
      </li>`,
        )
        .join('')}
    </ul>
  </div>`;
}

/* --------------------------------------------------------------- render ---- */

async function screen(ctx) {
  const model = await loadSyllabus();
  if (!model.ok) {
    return `<h1>Syllabus Analysis</h1>
      ${notice(
        `The syllabus data could not be read from this device (${esc(model.error || 'unknown error')}). It ships with the app, so a reload should restore it.`,
        'bad',
      )}`;
  }

  const routeNodeId = (ctx?.params || []).join('/');
  if (routeNodeId !== viewState.appliedRoute) {
    viewState.appliedRoute = routeNodeId;
    if (routeNodeId && model.nodes.has(routeNodeId)) {
      const node = model.nodes.get(routeNodeId);
      viewState.selectedId = routeNodeId;
      viewState.examId = node.examId;
      viewState.paperId = node.paperId;
      viewState.search = '';
      ancestorsOf(model.nodes, node).forEach((ancestor) => {
        viewState.expanded.add(ancestor.id);
        viewState.collapsed.delete(ancestor.id);
      });
    } else {
      viewState.selectedId = null;
    }
  }

  const papers = (model.nodes.get(viewState.examId)?.childIds || []).map((id) => model.nodes.get(id)).filter(Boolean);
  if (!papers.some((paper) => paper.id === viewState.paperId)) viewState.paperId = papers[0]?.id || null;
  const paper = model.nodes.get(viewState.paperId);

  const progressRows = await loadProgress();
  const overall = progressSummary(model, progressRows);

  return `<div class="syl">
    <header class="syl-head">
      <div class="syl-head-top">
        <h1>Syllabus Analysis</h1>
        <div class="syl-switch" role="tablist" aria-label="Examination stage">
          ${['prelims', 'mains']
            .map(
              (examId) =>
                `<button type="button" role="tab" aria-selected="${viewState.examId === examId}" class="syl-switch-btn${
                  viewState.examId === examId ? ' on' : ''
                }" data-exam="${examId}">${esc(EXAM_LABELS[examId])}</button>`,
            )
            .join('')}
        </div>
      </div>
      <label class="syl-search" for="sylSearch">
        ${icon('search', { size: 15 })}
        <span class="sr-only">Search the ${EXAM_LABELS[viewState.examId]} syllabus</span>
        <input type="search" id="sylSearch" value="${esc(viewState.search)}" placeholder="Search topics, headings and study units" autocomplete="off" />
        ${viewState.search ? `<button type="button" class="syl-clear" data-clear-search aria-label="Clear search">${icon('close', { size: 13 })}</button>` : ''}
      </label>
    </header>

    <div class="syl-layout">
      <nav class="syl-rail" aria-label="Papers">
        <div class="syl-rail-papers">
          ${papers
            .map((candidate) => {
              const summary = progressForNode(model, candidate, progressRows);
              return `<button type="button" class="syl-rail-item${candidate.id === viewState.paperId ? ' on' : ''}" data-paper="${esc(candidate.id)}">
                <span class="syl-rail-label"${langAttr(label(candidate))}>${esc(label(candidate))}</span>
                ${summary.done + summary.inProgress > 0 ? progressBar(summary.completion) : ''}
              </button>`;
            })
            .join('')}
        </div>
        <details class="syl-about"${viewState.showAbout ? ' open' : ''}>
          <summary>About this syllabus</summary>
          <div class="syl-about-body">
            <p>The commission's revised 2026 syllabus, shown with its own hierarchy and wording. Papers are grouped as the notification groups them.</p>
            ${
              model.source.pages_missing?.length
                ? `<p>Page${model.source.pages_missing.length > 1 ? 's' : ''} ${model.source.pages_missing.join(', ')} of the source file ${
                    model.source.pages_missing.length > 1 ? 'are' : 'is'
                  } missing, so a few lines are incomplete. Nothing was invented to fill them.</p>`
                : ''
            }
            <p>Study breakdowns are added guidance, marked wherever they appear. Marks and examination rules are not part of this section.</p>
            <button type="button" class="btn btn-quiet btn-sm" data-reset-progress${overall.touched ? '' : ' disabled'}>Reset progress</button>
          </div>
        </details>
      </nav>

      <section class="syl-body">
        ${
          viewState.search
            ? searchResults(model, progressRows)
            : paper
              ? `<div class="syl-toolbar">
                  <h2 class="syl-toolbar-title"${langAttr(label(paper))}>${esc(label(paper))}</h2>
                  <span class="syl-toolbar-actions">
                    <button type="button" class="btn btn-quiet btn-sm" data-expand-all>Expand all</button>
                    <button type="button" class="btn btn-quiet btn-sm" data-collapse-all>Collapse all</button>
                  </span>
                </div>
                <ul class="syl-tree">${treeNode(model, paper, progressRows, 0)}</ul>`
              : emptyState({ title: 'No papers', message: 'This stage has no papers in the source document.' })
        }
      </section>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- mount ---- */

async function mount(ctx, root) {
  const rerender = async () => {
    root.innerHTML = await screen(ctx);
    await mount(ctx, root);
  };

  root.querySelectorAll('[data-exam]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (viewState.examId === button.dataset.exam) return;
      viewState.examId = button.dataset.exam;
      viewState.paperId = null;
      viewState.selectedId = null;
      viewState.appliedRoute = null;
      viewState.expanded.clear();
      viewState.collapsed.clear();
      viewState.search = '';
      await rerender();
    });
  });

  root.querySelectorAll('[data-paper]').forEach((button) => {
    button.addEventListener('click', async () => {
      viewState.paperId = button.dataset.paper;
      viewState.selectedId = null;
      viewState.appliedRoute = null;
      viewState.collapsed.clear();
      viewState.search = '';
      await rerender();
    });
  });

  root.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.toggle;
      if (button.getAttribute('aria-expanded') === 'true') {
        viewState.expanded.delete(id);
        viewState.collapsed.add(id);
      } else {
        viewState.collapsed.delete(id);
        viewState.expanded.add(id);
      }
      await rerender();
    });
  });

  // Opening a node is a hash change, so back and forward move between the tree
  // and the topic that was opened, and the expansion state is not lost.
  root.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => ctx.navigate(`syllabus-analysis/${button.dataset.open}`));
  });

  root.querySelectorAll('[data-close-detail]').forEach((button) => {
    button.addEventListener('click', () => ctx.navigate('syllabus-analysis'));
  });

  root.querySelectorAll('[data-set-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await setProgressStatus(button.dataset.setStatus, button.dataset.status);
        await rerender();
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
  });

  root.querySelector('[data-expand-all]')?.addEventListener('click', async () => {
    const model = await loadSyllabus();
    if (model.ok && viewState.paperId) {
      const prefix = `${viewState.paperId}/`;
      model.nodes.forEach((node) => {
        if (node.kind === 'exam' || node.id === viewState.paperId || node.id.startsWith(prefix)) {
          viewState.collapsed.delete(node.id);
          if (node.childIds.length) viewState.expanded.add(node.id);
        }
      });
    }
    await rerender();
  });

  root.querySelector('[data-collapse-all]')?.addEventListener('click', async () => {
    const model = await loadSyllabus();
    if (model.ok && viewState.paperId) {
      const prefix = `${viewState.paperId}/`;
      viewState.expanded.clear();
      model.nodes.forEach((node) => {
        if (node.id.startsWith(prefix)) viewState.collapsed.add(node.id);
      });
    }
    viewState.selectedId = null;
    viewState.appliedRoute = null;
    await rerender();
  });

  root.querySelector('[data-clear-search]')?.addEventListener('click', async () => {
    viewState.search = '';
    await rerender();
  });

  const about = root.querySelector('.syl-about');
  about?.addEventListener('toggle', () => {
    viewState.showAbout = about.open;
  });

  root.querySelector('[data-reset-progress]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset syllabus progress?',
      message:
        'This clears every status marked in Syllabus Analysis. Your question bank, attempts, mistakes and revision schedule are not touched.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!confirmed) return;
    await resetProgress();
    toast('Syllabus progress cleared.', 'info');
    viewState.selectedId = null;
    viewState.appliedRoute = null;
    await rerender();
  });

  const searchInput = root.querySelector('#sylSearch');
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', (event) => {
      viewState.search = event.target.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await rerender();
        const refreshed = document.getElementById('sylSearch');
        if (refreshed) {
          refreshed.focus();
          const end = refreshed.value.length;
          try {
            refreshed.setSelectionRange(end, end);
          } catch {
            /* some environments refuse a selection range on search inputs */
          }
        }
      }, 200);
    });
    if (viewState.search) {
      searchInput.focus();
      try {
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      } catch {
        /* ignore */
      }
    }
  }
}

export default {
  title: 'Syllabus Analysis',

  render(ctx) {
    return screen(ctx);
  },

  mount,
};
