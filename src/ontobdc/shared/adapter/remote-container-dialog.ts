import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { RemoteContainerEntry } from '@/ontobdc/shared/domain/model/remote-container';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'remote_container_dialog';

const labelOf = (entry: RemoteContainerEntry): string => entry.title ?? entry.id ?? entry.location ?? '';

/**
 * Shows the containers of the server in a modal over the page: it opens at once, with a
 * message that they are loading, asks for them with `presentation.container.remote.list.requested`
 * and shows what answers. A container connects when chosen, by its URI. The modal is removed once closed.
 */
export function showRemoteContainers(): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog document-picker';
  dialog.setAttribute('aria-label', translate('remote.containers.title'));

  const title = document.createElement('h2');
  title.textContent = translate('remote.containers.title');
  const list = document.createElement('ul');
  list.className = 'document-picker-list';
  list.setAttribute('aria-busy', 'true');
  const message = document.createElement('li');
  message.className = 'tree-empty';
  message.textContent = translate('remote.containers.loading');
  list.append(message);
  const actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'confirm-dialog-cancel';
  close.textContent = translate('remote.containers.close');
  actions.append(close);
  dialog.append(title, list, actions);

  const show = (...items: HTMLElement[]): void => {
    list.removeAttribute('aria-busy');
    list.replaceChildren(...items);
  };
  const note = (text: string): HTMLLIElement => {
    const item = document.createElement('li');
    item.className = 'tree-empty';
    item.textContent = text;
    return item;
  };

  const unsubscribe = [
    eventBus.subscribe('presentation.container.remote.list.succeeded', ({ payload }) => {
      const containers = payload?.containers ?? [];
      show(...(containers.length === 0 ? [note(translate('remote.containers.none'))] : containers.map((entry) => {
        const item = document.createElement('li');
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = labelOf(entry);
        choose.title = entry.description ?? entry.location ?? '';
        choose.disabled = !entry.id;
        choose.addEventListener('click', () => {
          if (!entry.id) return;
          eventBus.publish('presentation.container.connect.requested', SOURCE, { container: entry.id });
          dialog.close();
        });
        item.append(choose);
        return item;
      })));
    }),
    eventBus.subscribe('presentation.container.remote.list.failed', ({ payload }) => {
      show(note(translate('remote.containers.error', { message: payload?.message ?? '' })));
    }),
  ];

  dialog.addEventListener('close', () => {
    unsubscribe.forEach((off) => off());
    dialog.remove();
  });
  close.addEventListener('click', () => dialog.close());
  document.body.append(dialog);
  dialog.showModal();
  eventBus.publish('presentation.container.remote.list.requested', SOURCE);
}
