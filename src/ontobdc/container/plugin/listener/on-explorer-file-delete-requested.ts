import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { confirmDialog } from '@/ontobdc/shared/adapter/confirm-dialog';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { entryName } from '@/ontobdc/shared/adapter/container-entries';
import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { CONTAINER_REFRESH_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const DELETE_REQUESTED = 'presentation.explorer.file.delete.requested';
type DeleteRequested = AppEventMap[typeof DELETE_REQUESTED];
const SOURCE = 'container_on_explorer_file_delete_requested';

export class OnExplorerFileDeleteRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Deletes a file or directory of the container once the person confirms, and refreshes the container.',
    arguments: [
      {
        listen: [DELETE_REQUESTED],
        valued: true,
        parameter: 'item',
        description: 'Path, in the container, of what is deleted.',
        type: 'str',
      },
    ],
  };

  private readonly request: DeleteRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as DeleteRequested | undefined;
  }

  /**
   * Asks for confirmation first: nothing is deleted if the person cancels. A directory goes with all it
   * holds. A container that cannot be written publishes `presentation.explorer.file.delete.failed`. After a
   * delete the runtime is told the folder changed, and `ontobdc container --refresh` is requested.
   */
  async run(): Promise<void> {
    const item = this.request?.item;
    if (!item) throw new Error('The request to delete carries no path.');

    try {
      const container = ContainerRepository.getInstance().get();
      if (container?.access !== 'readwrite' || !container.folder) throw new Error(translate('explorer.file.readOnly'));

      const confirmed = await confirmDialog({
        title: translate('explorer.delete.title'),
        message: translate('explorer.delete.message', { name: entryName(item) }),
        confirmLabel: translate('explorer.delete.confirm'),
        cancelLabel: translate('confirm.cancel'),
      });
      if (!confirmed) return;

      await ContainerFileRepository.of(container.folder).delete(item);
      eventBus.publish('presentation.python.mount.invalidated', SOURCE, { paths: [item] });
      eventBus.publish('presentation.main.command.requested', SOURCE, { requestId: crypto.randomUUID(), command: CONTAINER_REFRESH_COMMAND });
    } catch (error) {
      eventBus.publish('presentation.explorer.file.delete.failed', SOURCE, { item, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
