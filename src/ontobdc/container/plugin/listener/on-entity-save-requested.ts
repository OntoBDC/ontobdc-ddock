import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { publishEntity } from '@/ontobdc/container/plugin/listener/on-entity-refresh-requested';
import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { CONTAINER_ENTITY_COMMAND } from '@/ontobdc/shared/domain/model/container-command';

const SAVE_REQUESTED = 'presentation.entity.save.requested';
type SaveRequested = AppEventMap[typeof SAVE_REQUESTED];
const SOURCE = 'container_on_entity_save_requested';

export class OnEntitySaveRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Saves the changes made to an entity of the container.',
    arguments: [
      {
        listen: [SAVE_REQUESTED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity whose changes must be saved.',
        type: 'str',
      },
    ],
  };

  private readonly request: SaveRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as SaveRequested | undefined;
  }

  /**
   * Runs `ontobdc container --entity <id> --update '<changes as JSON>'`. When it
   * worked, publishes `presentation.entity.saved` (which ends the editing) and
   * reads that entity again so the database panel and its tab show the new values; when it
   * did not, publishes `presentation.entity.save.failed` with the reason and the
   * editing stays open.
   */
  async run(): Promise<void> {
    const id = this.request?.id;
    const changes = this.request?.changes;
    if (!id) throw new Error('The save request carries no entity id.');
    if (!changes || Object.keys(changes).length === 0) throw new Error('The save request carries no changes.');

    // The command parser has no escape syntax: the JSON goes inside single quotes,
    // so any apostrophe in a value is written as its JSON escape.
    const source = JSON.stringify(changes).replaceAll("'", '\\u0027');
    try {
      await requestCommand(`${CONTAINER_ENTITY_COMMAND} ${quoted(id)} --update '${source}'`, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.entity.save.failed', SOURCE, { id, message: error instanceof Error ? error.message : String(error) });
      return;
    }
    eventBus.publish('presentation.entity.saved', SOURCE, { id });
    // Only the entity that was saved is read again: the others did not change.
    try {
      await publishEntity(id, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.entity.refresh.failed', SOURCE, { id, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
