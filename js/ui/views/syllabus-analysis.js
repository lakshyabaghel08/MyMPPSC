/**
 * syllabus-analysis.js (view) — the former Syllabus Analysis screen.
 *
 * Syllabus Analysis and the Syllabus & Study Planner were two screens over the
 * same curriculum: two trees, two stores and two progress figures that could
 * not see each other. They are now one section, `js/ui/views/syllabus.js`.
 *
 * This module stays so the route does: `#/syllabus-analysis` and
 * `#/syllabus-analysis/<nodeId>` are in the curated PYQ link chips, in older
 * notes and in anything a user bookmarked. They render the merged section, in
 * the same place they always pointed to, rather than 404-ing to the dashboard.
 * The merged view reads `<nodeId>` in its legacy form, so a deep link still
 * opens the same syllabus node.
 */

import syllabusView from './syllabus.js';

export default {
  title: 'Syllabus',

  render(ctx) {
    return syllabusView.render(ctx);
  },

  mount(ctx, root) {
    return syllabusView.mount(ctx, root);
  },
};
