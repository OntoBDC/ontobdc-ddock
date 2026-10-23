import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { entryName, isEntryName } from '@/ontobdc/shared/adapter/container-entries';
import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { promptDialog } from '@/ontobdc/shared/adapter/prompt-dialog';
import { CONTAINER_REFRESH_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const RENAME_REQUESTED = 'presentation.explorer.file.rename.requested';
type RenameRequested = AppEventMap[typeof RENAME_REQUESTED];
const SOURCE = 'container_on_explorer_file_rename_requested';

export class OnExplorerFileRenameRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Asks the new name of a file or directory of the container, renames it and refreshes the container.',
    arguments: [
      {
        listen: [RENAME_REQUESTED],
        valued: true,
        parameter: 'item',
        description: 'Path, in the container, of what is renamed.',
        type: 'str',
      },
    ],
  };

  private readonly request: RenameRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as RenameRequested | undefined;
  }

  /**
   * Asks the name the person wants, and renames the entry in its directory. Nothing happens when they
   * cancel or keep the name. A name that is not valid, or is taken, or a container that cannot be written,
   * publishes `presentation.explorer.file.rename.failed` and changes nothing. After a rename the runtime
   * is told the folder changed, and `ontobdc container --refresh` is requested.
   */
  async run(): Promise<void> {
    const item = this.request?.item;
    if (!item) throw new Error('The request to rename carries no path.');

    try {
      const container = ContainerRepository.getInstance().get();
      if (container?.access !== 'readwrite' || !container.folder) throw new Error(translate('explorer.file.readOnly'));

      const current = entryName(item);
      const name = await promptDialog({
        title: translate('explorer.rename.title'),
        label: translate('explorer.rename.label'),
        initial: current,
        confirmLabel: translate('explorer.rename.confirm'),
        cancelLabel: translate('confirm.cancel'),
      });
      if (name === null || name === current) return;
      if (!isEntryName(name)) throw new Error(translate('explorer.rename.invalid'));
      if (await ContainerFileRepository.of(container.folder).nameTakenNextTo(item, name)) throw new Error(translate('explorer.rename.exists', { name }));

      await ContainerFileRepository.of(container.folder).rename(item, name);
      const parent = item.split('/').slice(0, -1);
      eventBus.publish('presentation.python.mount.invalidated', SOURCE, { paths: [item, [...parent, name].join('/')] });
      eventBus.publish('presentation.main.command.requested', SOURCE, { requestId: crypto.randomUUID(), command: CONTAINER_REFRESH_COMMAND });
    } catch (error) {
      eventBus.publish('presentation.explorer.file.rename.failed', SOURCE, { item, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
