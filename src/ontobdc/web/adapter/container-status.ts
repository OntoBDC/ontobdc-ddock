import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { translate } from '@/ontobdc/shared/plugin/i18n';
import type { ContainerOpened } from '@/ontobdc/shared/domain/model/container';

/** Presentation listens to container state; it never calls the filesystem adapter. */
export function initContainerStatus(): () => void {
  let container: ContainerOpened | null = null;
  let availability: 'LOCAL' | 'REMOTE' | null = null;
  const render = (): void => {
    const name = document.querySelector<HTMLElement>('.container');
    if (name) {
      if (container) {
        delete name.dataset.i18n;
        name.textContent = container.name;
      } else {
        name.dataset.i18n = 'titlebar.noWorkspace';
        name.textContent = translate('titlebar.noWorkspace');
      }
    }
    const permission = document.querySelector<HTMLElement>('.statusbar-permission');
    const availabilityLabel = document.querySelector<HTMLElement>('.statusbar-container-availability');
    if (availabilityLabel) availabilityLabel.textContent = container ? availability ?? '' : '';
    const label = permission?.querySelector<HTMLElement>('.statusbar-permission-label');
    if (permission && label) {
      permission.dataset.state = !container ? 'disconnected' : container.access === 'readwrite' ? 'connected' : 'read-only';
      const key = !container ? 'statusbar.permission.disconnected' : container.access === 'readwrite' ? 'statusbar.permission.connected' : 'statusbar.permission.readOnly';
      label.dataset.i18n = key;
      label.textContent = translate(key);
    }
  };
  const unsubscribe = [
    eventBus.subscribe('presentation.container.local.opened', ({ payload }) => { container = payload ?? null; availability = 'LOCAL'; render(); }),
    eventBus.subscribe('presentation.container.remote.opened', ({ payload }) => { container = payload ?? null; availability = 'REMOTE'; render(); }),
    eventBus.subscribe('presentation.container.state.reported', ({ payload }) => { container = payload?.container ?? null; render(); }),
    eventBus.subscribe('presentation.main.layout.loaded', () => {
      eventBus.publish('presentation.container.state.requested', 'container-status');
    }),
    eventBus.subscribe('presentation.main.locale.changed', render),
  ];
  return () => unsubscribe.forEach((dispose) => dispose());
}
