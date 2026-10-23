import { createDockview, themeLight, themeVisualStudio } from 'dockview';
import { describePanel, setActivePanel } from '@/ontobdc/shared/adapter/active-panel';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { getTheme, onThemeChange } from '@/ontobdc/shared/adapter/theme';
import { createDockComponentFactory, observePanelClosures, type PanelFactory } from '@/ontobdc/shared/adapter/view';
import { onLocaleChange, translate } from '@/ontobdc/shared/plugin/i18n';

/** Listen before rendering the shell; its loaded event mounts Surface and Home. */
export function initSurface(factories: Record<string, PanelFactory>): () => void {
  let disposeSurface: (() => void) | undefined;

  const unsubscribeLayout = eventBus.subscribe('presentation.main.layout.loaded', () => {
    disposeSurface?.();
    const host = document.querySelector<HTMLDivElement>('#dockview');
    if (!host) throw new Error('Surface host not found');

    const dockview = createDockview(host, {
      theme: getTheme() === 'light' ? themeLight : themeVisualStudio,
      createComponent: createDockComponentFactory(factories),
    });

    const unsubscribeClosures = observePanelClosures(dockview, 'surface');
    const activation = dockview.onDidActivePanelChange((change) => {
      const id = change.panel?.id ?? null;
      setActivePanel(id);
      eventBus.publish('presentation.main.panel.activated', 'surface', {
        container: 'surface',
        id,
        ...(id === null ? { kind: 'other' as const } : describePanel(id)),
      });
    });
    const unsubscribeOpenRequests = eventBus.subscribe('presentation.main.panel.open.requested', ({ payload }) => {
      if (payload?.container !== 'surface') return;
      const existing = dockview.getPanel(payload.id);
      if (existing) {
        existing.api.setActive();
        return;
      }
      dockview.addPanel({
        id: payload.id,
        component: payload.component,
        title: payload.title ?? payload.id,
      });
    });
    const unsubscribeCloseRequests = eventBus.subscribe('presentation.main.panel.close.requested', ({ payload }) => {
      if (payload?.container !== 'surface') return;
      dockview.getPanel(payload.id)?.api.close();
    });
    disposeSurface = () => {
      unsubscribeClosures();
      unsubscribeOpenRequests();
      unsubscribeCloseRequests();
      dockview.dispose();
    };
    dockview.addPanel({ id: 'home', component: 'home', title: translate('home.tab'), });

    const unsubscribeTheme = onThemeChange((theme) => {
      dockview.updateOptions({ theme: theme === 'light' ? themeLight : themeVisualStudio });
    });
    const unsubscribeLocale = onLocaleChange(() => {
      dockview.getPanel('home')?.api.setTitle(translate('home.tab'));
    });

    disposeSurface = () => {
      activation.dispose();
      setActivePanel(null);
      unsubscribeClosures();
      unsubscribeOpenRequests();
      unsubscribeCloseRequests();
      unsubscribeTheme();
      unsubscribeLocale();
      dockview.dispose();
    };
  });

  return () => {
    unsubscribeLayout();
    disposeSurface?.();
  };
}
