import type { AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import { ExplorerFileOpenMachine } from '@/ontobdc/container/plugin/machine/explorer_file_open/machine';
import type { ExplorerFileOpenRequest } from '@/ontobdc/container/plugin/machine/explorer_file_open/port';

const FILE_ACTIVATED = 'presentation.explorer.file.activated';
type ExplorerItemActivated = AppEventMap[typeof FILE_ACTIVATED];

export class OnExplorerFileActivated {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_explorer_file_activated',
    logical_component: 'web',
    description: 'Responds when a file is activated (double-clicked) in the explorer.',
    arguments: [
      {
        listen: [FILE_ACTIVATED],
        valued: true,
        parameter: 'item',
        description: 'Path of the item activated in the explorer.',
        type: 'str',
      },
    ],
  };

  private readonly request: ExplorerItemActivated | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as ExplorerItemActivated | undefined;
  }

  /** Hands the selected item to the file-open machine; the machine does the work. */
  async run(): Promise<void> {
    if (!this.request?.item) throw new Error('The explorer activation carries no item.');

    const request: ExplorerFileOpenRequest = { item: this.request.item };
    await new ExplorerFileOpenMachine(request).execute();
  }
}
