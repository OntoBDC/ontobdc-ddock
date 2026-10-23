import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const ITEM_OPENED = 'presentation.database.item.opened';
type DatabaseItemOpened = AppEventMap[typeof ITEM_OPENED];

export class OnDatabaseItemOpened {
  static readonly METADATA: ListenerMetadata = {
    id: 'container_on_database_item_opened',
    logical_component: 'container',
    description: 'Opens the tab of an entity when an item of the database is opened.',
    arguments: [
      {
        listen: [ITEM_OPENED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity that was opened.',
        type: 'str',
      },
    ],
  };

  private readonly request: DatabaseItemOpened | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as DatabaseItemOpened | undefined;
  }

  /** Asks the surface for the tab `entity:<global id>`, titled with the entity; asking again focuses it. */
  run(): void {
    if (!this.request?.id) throw new Error('The opened database item carries no id.');

    const item = EntityRepository.getInstance().find(this.request.id)?.item;
    eventBus.publish('presentation.main.panel.open.requested', 'container_on_database_item_opened', {
      container: 'surface',
      id: `entity:${this.request.id}`,
      component: 'entity',
      title: item?.name || this.request.id,
    });
  }
}
