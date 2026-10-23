import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const OPEN_REQUESTED = 'presentation.explorer.tag.open.requested';
type OpenRequested = AppEventMap[typeof OPEN_REQUESTED];
const SOURCE = 'container_on_explorer_tag_open_requested';

export class OnExplorerTagOpenRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Opens the tab with the entities that have a tag, grouped by kind.',
    arguments: [
      {
        listen: [OPEN_REQUESTED],
        valued: true,
        parameter: 'tag',
        description: 'The tag whose entities the tab shows.',
        type: 'str',
      },
    ],
  };

  private readonly request: OpenRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as OpenRequested | undefined;
  }

  /** Asks the surface for the tab `tag:<tag>`; asking again focuses it. */
  run(): void {
    const tag = this.request?.tag;
    if (!tag) throw new Error('The request to open a tag carries no tag.');
    eventBus.publish('presentation.main.panel.open.requested', SOURCE, {
      container: 'surface',
      id: `tag:${tag}`,
      component: 'tag',
      title: translate('tag.tab', { tag }),
    });
  }
}
