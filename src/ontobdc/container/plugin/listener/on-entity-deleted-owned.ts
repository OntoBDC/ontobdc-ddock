import { entityFacadeOf } from '@/ontobdc/shared/adapter/entity-facade';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { EntityItem } from '@/ontobdc/shared/domain/model/entity';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const DELETED = 'presentation.entity.deleted';
type Deleted = AppEventMap[typeof DELETED];
const SOURCE = 'container_on_entity_deleted_owned';
/** The separator of the values of a field in its data source. */
const SEPARATOR = '|';

export class OnEntityDeletedOwned {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Deletes what a deleted entity owned: the entities its owned fields pointed to (the framework of a work stream).',
    arguments: [
      {
        listen: [DELETED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity that was deleted.',
        type: 'str',
      },
    ],
  };

  private readonly item: EntityItem | undefined;

  constructor(event: AppEvent) {
    const id = (event.payload as Deleted | undefined)?.id;
    // The entity is still among the ones the repository has: they are read again only after the deletion was announced.
    this.item = id ? EntityRepository.getInstance().find(id)?.item : undefined;
  }

  /**
   * Asks for the deletion (`presentation.entity.delete.confirmed`, the one of every entity, so what the deleted one owned
   * owns is deleted too) of each entity the owned fields of the deleted one pointed to. An entity the repository did not
   * have owned nothing it knows of.
   */
  async run(): Promise<void> {
    const item = this.item;
    if (!item) return;

    const facade = await entityFacadeOf(item.type);
    for (const field of facade.fields.filter((declared) => declared.owned === true)) {
      const values = item.fields.find((candidate) => candidate.name === field.identifier)?.values ?? [];
      for (const id of values.flatMap((text) => text.split(SEPARATOR)).map((text) => text.trim()).filter(Boolean)) {
        eventBus.publish('presentation.entity.delete.confirmed', SOURCE, { id });
      }
    }
  }
}
