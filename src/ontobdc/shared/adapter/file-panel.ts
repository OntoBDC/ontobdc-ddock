import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import type { Mountable, PanelFactory } from '@/ontobdc/shared/adapter/view';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import { translate } from '@/ontobdc/shared/plugin/i18n';

/** The events published when the tab of a file is closed. */
export type FileClosedEvent = {
  [K in keyof AppEventMap]: AppEventMap[K] extends { item: string } ? (K extends `presentation.${string}.closed` ? K : never) : never;
}[keyof AppEventMap];

export type FilePanelOptions = {
  /** The Dockview panel id is `<prefix>:<path>`. */
  prefix: string;
  /** Extra CSS class of the panel, besides `file-panel`. */
  className: string;
  /** Published, with the path, when the tab is closed. */
  closedEvent: FileClosedEvent;
  /**
   * Shows the file in `element`. May return a function that releases what the
   * rendering holds (such as an object URL); it runs when the tab closes.
   */
  render(file: File, element: HTMLElement, item: string): Promise<(() => void) | void> | (() => void) | void;
};

/**
 * Builds the panel of a tab that shows one file of the opened container. The
 * factory cannot fail once Dockview added the tab, so every problem (no
 * container, unreadable file) is shown inside the tab. The tab draws its file again when
 * `presentation.explorer.file.reload.requested` names it.
 */
export function makeFilePanel(options: FilePanelOptions): PanelFactory {
  return ({ id }): Mountable => {
    const prefix = `${options.prefix}:`;
    const item = id.startsWith(prefix) ? id.slice(prefix.length) : id;

    const element = document.createElement('div');
    element.className = `panel-content file-panel ${options.className}`;

    const showStatus = (text: string, role?: 'alert'): HTMLElement => {
      const line = document.createElement('p');
      line.className = 'file-status';
      if (role) line.setAttribute('role', role);
      line.textContent = text;
      element.replaceChildren(line);
      return line;
    };

    let release: (() => void) | void;
    let disposed = false;
    /** Which drawing of the file is the current one: a file read again while the last read is still going supersedes it. */
    let drawing = 0;

    const load = async (): Promise<void> => {
      const mine = ++drawing;
      const loading = showStatus(translate('file.loading'));
      const folder = ContainerRepository.getInstance().get()?.folder;
      if (!folder) {
        showStatus(translate('file.noContainer'), 'alert');
        return;
      }
      try {
        const file = await ContainerFileRepository.of(folder).file(item);
        if (disposed || mine !== drawing) return;
        // The loading line stays until the file is drawn; heavy files take a while.
        const released = await options.render(file, element, item);
        if (disposed || mine !== drawing) {
          released?.();
          return;
        }
        release = released;
        loading.remove();
      } catch (error) {
        if (!disposed && mine === drawing) {
          showStatus(translate('file.loadFailed', { message: error instanceof Error ? error.message : String(error) }), 'alert');
        }
      }
    };
    void load();

    // The person asked to read the file again: what the tab holds is released and the file is drawn anew.
    const unsubscribe = eventBus.subscribe('presentation.explorer.file.reload.requested', ({ payload }) => {
      if (payload?.item !== item || disposed) return;
      release?.();
      release = undefined;
      void load();
    });

    return {
      element,
      dispose: () => {
        disposed = true;
        unsubscribe();
        release?.();
        element.remove();
        eventBus.publish(options.closedEvent, options.prefix, { item });
      },
    };
  };
}
