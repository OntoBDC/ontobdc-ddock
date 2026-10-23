import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { toMountable, type Mountable, type PanelFactory } from '@/ontobdc/shared/adapter/view';
import { applyTranslations, type MessageKey } from '@/ontobdc/shared/plugin/i18n';

/** The views of the left pane: the panel that fills it, and the header it takes while it is shown. */
const VIEWS: Record<string, { panel: string; header: MessageKey }> = {
  explorer: { panel: 'explorer', header: 'pane.explorer.header' },
  database: { panel: 'database', header: 'pane.database.header' },
};

/**
 * Mounts every view of the left pane once, in the pane the shell creates for
 * them (so a populated tree survives switching away), and shows the one picked
 * in the activity bar, swapping the pane header with it.
 */
export function initSidebar(factories: Record<string, PanelFactory>): () => void {
  let mounted: Mountable[] = [];

  const unsubscribeLayout = eventBus.subscribe('presentation.main.layout.loaded', () => {
    mounted.forEach((view) => view.dispose?.());
    mounted = [];
    const host = document.querySelector<HTMLDivElement>('#explorer-host');
    const title = document.querySelector<HTMLSpanElement>('.explorer-pane-title');
    if (!host || !title) throw new Error('Explorer host not found');

    for (const [view, { panel }] of Object.entries(VIEWS)) {
      const factory = factories[panel];
      if (!factory) throw new Error(`Sidebar panel not found: ${panel}`);
      const mountable = toMountable(factory({ id: panel }));
      mountable.element.dataset.sidebarView = view;
      host.appendChild(mountable.element);
      mounted.push(mountable);
    }

    // The views are read from the DOM, so a view mounted later (by a listener
    // that adds an activity button and a [data-sidebar-view] element) is shown
    // and hidden like the built-in ones.
    const bar = document.querySelector<HTMLElement>('.activitybar');
    const show = (view: string): void => {
      for (const element of host.querySelectorAll<HTMLElement>('[data-sidebar-view]')) {
        element.hidden = element.dataset.sidebarView !== view;
      }
      let header: string | undefined = VIEWS[view]?.header;
      for (const button of document.querySelectorAll<HTMLButtonElement>('.activity[data-view]')) {
        const active = button.dataset.view === view;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        if (active) header ??= button.dataset.header;
      }
      if (header) title.dataset.i18n = header;
      applyTranslations(title.parentElement ?? title);
    };
    bar?.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('.activity[data-view]');
      if (button?.dataset.view) show(button.dataset.view);
    });
    show('explorer');
  });

  return () => {
    unsubscribeLayout();
    mounted.forEach((view) => view.dispose?.());
    mounted = [];
  };
}
