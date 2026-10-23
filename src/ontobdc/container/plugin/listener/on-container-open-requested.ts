import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { directorySource, openContainer } from '@/ontobdc/shared/adapter/container-source';
import { OpenContainerMachine } from '@/ontobdc/container/plugin/machine/open_container/machine';
import { ContainerCreationCancelledError } from '@/ontobdc/shared/domain/exception/container-creation';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const OPEN_REQUESTED = 'presentation.container.open.requested';
const SOURCE = 'container_on_open_requested';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class OnContainerOpenRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Opens the container folder the person picks and reports the result.',
    arguments: [
      {
        listen: [OPEN_REQUESTED],
        valued: false,
        description: 'The person asked to open a container folder.',
        type: 'str',
      },
    ],
  };

  /** Opens the container folder the person picks. */
  async run(): Promise<void> {
    const picker = (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker;
    if (picker) await this.chooseFolder();
    else await this.chooseReadOnly();
  }

  /**
   * Hands the opening to the machine of the open container, which asks for the folder of the
   * container and makes sure the workspace around it is in order. Then opens the container,
   * which publishes `local.opened` or, if it cannot, `open.failed`.
   */
  private async chooseFolder(): Promise<void> {
    try {
      const machine = new OpenContainerMachine();
      await machine.execute();
      const container = machine.containerFolder();
      if (!container) throw new Error('There is no folder of the container to open.');
      await openContainer(directorySource(container), SOURCE);
    } catch (error) {
      if (error instanceof ContainerCreationCancelledError) eventBus.publish('presentation.container.open.cancelled', SOURCE);
      else this.failed('read-error', null, error);
    }
  }

  /** Browsers without the directory picker open a container read-only, from its files. */
  private async chooseReadOnly(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.hidden = true;
    document.body.append(input);

    await new Promise<void>((resolve) => {
      const cleanup = (): void => input.remove();
      input.addEventListener('cancel', () => {
        cleanup();
        eventBus.publish('presentation.container.open.cancelled', SOURCE);
        resolve();
      }, { once: true });
      input.addEventListener('change', () => {
        const picked = Array.from(input.files ?? []);
        cleanup();
        if (!picked.length) {
          eventBus.publish('presentation.container.open.cancelled', SOURCE);
          resolve();
          return;
        }
        const name = picked[0].webkitRelativePath.split('/')[0];
        const files = new Map(picked.map((file) => [file.webkitRelativePath.slice(name.length + 1), file]));
        void openContainer({
          name, access: 'read',
          read: async (path) => files.get(path) ?? null,
          mount: async (path) => ({ path, files: await Promise.all([...files]
            .filter(([relative]) => relative.startsWith('.__ontobdc__/'))
            .map(async ([relative, file]) => ({ path: relative, data: await file.arrayBuffer() }))) }),
        }, SOURCE).finally(resolve);
      }, { once: true });
      input.click();
    });
  }

  private failed(reason: AppEventMap['presentation.container.open.failed']['reason'], name: string | null, error?: unknown): void {
    eventBus.publish('presentation.container.open.failed', SOURCE, {
      reason, name, ...(error === undefined ? {} : { message: messageOf(error) }),
    });
  }
}
