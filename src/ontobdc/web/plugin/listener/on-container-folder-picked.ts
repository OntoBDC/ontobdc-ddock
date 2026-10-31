import { notify } from '@/ontobdc/shared/adapter/notice';
import type { AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

export class OnContainerFolderPicked {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_container_folder_picked',
    logical_component: 'web',
    description: 'Tells the person, in a notice, that the folder they chose is being read and will be there shortly.',
    arguments: [{
      listen: ['presentation.container.folder.picked'],
      valued: false,
      description: 'The person chose the folder of the container to open.',
      type: 'str',
    }],
  };

  constructor(private readonly event: AppEvent<{ name: string }>) {}

  run(): void {
    notify(translate('notice.container.folder.picked', { name: this.event.payload?.name ?? '' }), 'info');
  }
}
