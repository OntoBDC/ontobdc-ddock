import type { AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { notify } from '@/ontobdc/shared/adapter/notice';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const FILE_UNSUPPORTED = 'presentation.explorer.file.unsupported';
type FileUnsupported = AppEventMap[typeof FILE_UNSUPPORTED];

export class OnExplorerFileUnsupported {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_explorer_file_unsupported',
    logical_component: 'web',
    description: 'Warns the person that the file they activated cannot be opened: no capability handles its type.',
    arguments: [
      {
        listen: [FILE_UNSUPPORTED],
        valued: true,
        parameter: 'item',
        description: 'Path of the file that no capability can open.',
        type: 'str',
      },
    ],
  };

  private readonly request: FileUnsupported | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as FileUnsupported | undefined;
  }

  /** Shows a warning with the name of the file and its type; nothing is opened. */
  run(): void {
    if (!this.request?.item) throw new Error('The unsupported file carries no path.');

    const name = this.request.item.split('/').pop() || this.request.item;
    const extension = this.request.extension;
    notify(
      extension
        ? translate('notice.file.unsupported', { name, extension: extension.toUpperCase() })
        : translate('notice.file.unsupported.noExtension', { name }),
      'warning',
    );
  }
}
