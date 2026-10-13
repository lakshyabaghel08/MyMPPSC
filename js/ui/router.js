/**
 * router.js — Hash-based router.
 *
 * Routes look like `#/analytics`, `#/runner/test_abc123`, `#/bank/question/Q-1`.
 * A route module is `{ title, render(ctx) -> string|Promise<string>, mount?(ctx) }`.
 */

import { loadingState, notice, esc } from './components.js';

export class Router {
  constructor({ container, routes = {}, fallback = 'dashboard', onNavigate = null }) {
    this.container = container;
    this.routes = { ...routes };
    this.fallback = fallback;
    this.onNavigate = onNavigate;
    this.currentRoute = null;
    this.viewState = {};
    this.activeCleanup = null;
    /**
     * The destination of the most recent resolve(). A render is asynchronous,
     * so a slow screen can still be awaiting its data when the reader
     * navigates somewhere else; without this the slow one would finish last
     * and paint itself over the screen that replaced it. A resolve that finds
     * a *different* destination pending has been superseded and stands down.
     * Two resolves of the same destination (the hashchange event arrives after
     * an explicit navigate) both paint, which is harmless.
     */
    this.pendingTarget = null;
    this._onHashChange = () => this.resolve();
  }

  register(name, view) {
    this.routes[name] = view;
  }

  start() {
    window.addEventListener('hashchange', this._onHashChange);
    this.resolve();
  }

  stop() {
    window.removeEventListener('hashchange', this._onHashChange);
  }

  navigate(path, { replace = false } = {}) {
    const target = `#/${String(path).replace(/^#?\/?/, '')}`;
    if (replace) window.location.replace(target);
    else window.location.hash = target;
    if (replace) this.resolve();
  }

  parse() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const [name = '', ...params] = raw.split('/').filter((p) => p !== '');
    return { name: name || this.fallback, params: params.map(decodeURIComponent) };
  }

  async resolve() {
    const { name, params } = this.parse();
    const view = this.routes[name] || this.routes[this.fallback];
    const routeName = this.routes[name] ? name : this.fallback;
    this.currentRoute = { name: routeName, params, view };

    const target = `${routeName}/${params.join('/')}`;
    this.pendingTarget = target;
    /** False once a different destination has been asked for. */
    const current = () => this.pendingTarget === target;
    const ctx = {
      route: routeName,
      params,
      navigate: (path, opts) => this.navigate(path, opts),
      router: this,
      state: this.viewState,
      setState: (patch) => Object.assign(this.viewState, patch),
      refresh: () => this.resolve(),
    };

    if (typeof document !== 'undefined') {
      const screenTitle = view?.title || 'Dashboard';
      document.title = `${screenTitle} · MyMPPSC`;
      const announcer = document.getElementById('routeAnnouncer');
      if (announcer) announcer.textContent = `${screenTitle} · MyMPPSC`;
      if (routeName !== 'runner') document.body?.classList.remove('runner-focus');
    }

    if (this.onNavigate) this.onNavigate(routeName, params);

    // Let the previous screen release anything it holds (interval timers,
    // document listeners). This runs before the new screen renders, so a
    // background timer from the test runner cannot keep running elsewhere in
    // the app — or keep the process alive in the test harness.
    if (typeof this.activeCleanup === 'function') {
      const previous = this.activeCleanup;
      this.activeCleanup = null;
      try {
        await previous();
      } catch (err) {
        console.warn('View cleanup failed', err);
      }
    }

    if (!current()) return;
    this.container.innerHTML = loadingState();
    try {
      const markup = await view.render(ctx);
      // A newer navigation started while this screen was loading its data:
      // that screen is the one the reader asked for, so leave it alone.
      if (!current()) return;
      this.container.innerHTML = markup || '';
      if (typeof view.mount === 'function') await view.mount(ctx, this.container);
      if (!current()) return;
      this.activeCleanup = typeof view.cleanup === 'function' ? () => view.cleanup(ctx) : null;
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    } catch (err) {
      console.error(`View "${routeName}" failed to render`, err);
      if (!current()) return;
      this.container.innerHTML = notice(
        `<strong>This screen could not be displayed.</strong> The error was: <code>${esc(err.message)}</code>.
         Your saved data is untouched. You can go back to the <a href="#/dashboard">dashboard</a> and try again.`,
        'bad',
      );
    }
  }
}
