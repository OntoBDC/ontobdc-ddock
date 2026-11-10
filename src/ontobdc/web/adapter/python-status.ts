import { eventBus } from '@/ontobdc/shared/adapter/event-bus';

/** Mount a runtime indicator; return cleanup for all its subscriptions. */
export function mountPythonStatus(host: HTMLElement): () => void {
  const indicator = document.createElement('span');
  indicator.className = 'python-status';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  const STAGES = { runtime: 'loading the runtime', packages: 'loading the packages', wheels: 'installing the packages of the project' } as const;
  const update = (connected: boolean, stage?: keyof typeof STAGES): void => {
    const label = `Pyodide: ${connected ? 'connected' : stage ? STAGES[stage] : 'disconnected'}`;
    indicator.dataset.state = connected ? 'connected' : stage ? 'loading' : 'unplugged';
    indicator.title = label;
    indicator.setAttribute('aria-label', label);
    const paths = connected
      ? '<path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0ZM12 17v5"/>'
      : '<path d="m3 3 18 18M9 3v3M15 3v5M12 8h5v4M7 8v4a5 5 0 0 0 5 5M12 17v5"/>';
    indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  };
  update(false);
  host.prepend(indicator);
  // The step of the loading the runtime is at, while it is loading: a report of the state that is not ready does not erase it.
  let stage: keyof typeof STAGES | undefined;
  const unsubscribe = [
    eventBus.subscribe('presentation.python.state.reported', ({ payload }) => update(payload?.ready ?? false, payload?.ready ? undefined : stage)),
    eventBus.subscribe('presentation.python.ready', () => { stage = undefined; update(true); }),
    eventBus.subscribe('presentation.python.loading', () => { stage = 'runtime'; update(false, stage); }),
    eventBus.subscribe('presentation.python.progress', ({ payload }) => { stage = payload?.stage; update(false, stage); }),
    eventBus.subscribe('presentation.python.failed', () => { stage = undefined; update(false); }),
    eventBus.subscribe('presentation.python.disconnected', () => { stage = undefined; update(false); }),
  ];
  eventBus.publish('presentation.python.state.requested', 'python-status');
  return () => {
    unsubscribe.forEach((dispose) => dispose());
    indicator.remove();
  };
}
