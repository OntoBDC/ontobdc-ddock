import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { entityGroupsOf } from '@/ontobdc/shared/adapter/container-format';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const REFRESH_REQUESTED = 'presentation.entity.refresh.requested';
const SOURCE = 'container_on_entity_refresh_requested';

type RefreshRequested = AppEventMap[typeof REFRESH_REQUESTED];

/** Reads one entity of the container, and only that one, and publishes it. Shared by what changes an entity. */
export async function publishEntity(id: string, source: string): Promise<void> {
  const result = await requestCommand(`ontobdc container --entity ${quoted(id)} --read`, source);
  const groups = entityGroupsOf(result.stdout);
  if (!groups) throw new Error('The command did not answer with the entity.');
  eventBus.publish('presentation.container.entity.found', source, { groups });
}

export class OnEntityRefreshRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Reads one entity of the container again, and only that one.',
    arguments: [
      {
        listen: [REFRESH_REQUESTED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity to read again.',
        type: 'str',
      },
    ],
  };

  private readonly request: RefreshRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as RefreshRequested | undefined;
  }

  /** Runs `ontobdc container --entity <id> --read` and publishes the entity it answers, or why it could not. */
  async run(): Promise<void> {
    const id = this.request?.id;
    if (!id) throw new Error('The refresh request carries no entity id.');

    try {
      await publishEntity(id, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.entity.refresh.failed', SOURCE, { id, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
