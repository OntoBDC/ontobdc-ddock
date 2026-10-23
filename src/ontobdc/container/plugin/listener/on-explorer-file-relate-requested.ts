import { activeEntityId } from '@/ontobdc/shared/adapter/active-panel';
import { containerDocuments } from '@/ontobdc/shared/adapter/container-documents';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { startEditing } from '@/ontobdc/shared/adapter/entity-editing';
import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { documentFieldsOf } from '@/ontobdc/shared/adapter/list-editors';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const RELATE_REQUESTED = 'presentation.explorer.file.relate.requested';
type RelateRequested = AppEventMap[typeof RELATE_REQUESTED];
const SOURCE = 'container_on_explorer_file_relate_requested';

export class OnExplorerFileRelateRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Relates a file of the container to the entity of the active tab, as if the person had added it to the field of documents of the tab.',
    arguments: [
      {
        listen: [RELATE_REQUESTED],
        valued: true,
        parameter: 'item',
        description: 'Path, in the container, of the file to relate.',
        type: 'str',
      },
    ],
  };

  private readonly request: RelateRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as RelateRequested | undefined;
  }

  /**
   * Takes the entity of the active tab, puts its tab in editing if it is not, and publishes
   * `presentation.entity.list.item.chosen` with the document of the file for its field of
   * documents: what the + of the tab publishes once the person picks a file. Nothing is saved; the
   * person saves the tab. When no entity tab is active, or the entity has no field of documents,
   * it publishes `presentation.explorer.file.relate.failed`.
   */
  async run(): Promise<void> {
    const item = this.request?.item;
    if (!item) throw new Error('The request to relate a file carries no item.');
    const fail = (message: string): void => {
      eventBus.publish('presentation.explorer.file.relate.failed', SOURCE, { item, message });
    };

    const owner = activeEntityId();
    if (owner === null) return fail(translate('notice.file.relate.no_entity'));
    try {
      if (documentFieldsOf(owner).length === 0) await startEditing(owner);
      const [field] = documentFieldsOf(owner);
      if (!field) return fail(translate('notice.file.relate.no_documents'));

      const folder = ContainerRepository.getInstance().get()?.folder;
      if (!folder) throw new Error('The container is not open with write access.');
      const document = (await containerDocuments(folder)).find(({ path }) => path === item);
      if (!document) throw new Error(`${item} is not a document of the container.`);
      eventBus.publish('presentation.entity.list.item.chosen', SOURCE, { owner, field, item: document.iri });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}
