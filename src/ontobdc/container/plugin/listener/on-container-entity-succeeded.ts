import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { entityGroupsOf } from '@/ontobdc/shared/adapter/container-format';
import { CONTAINER_ENTITY_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const EVENT = 'presentation.main.code.success';
type Payload = AppEventMap[typeof EVENT];

export class OnContainerEntitySucceeded {
  static readonly METADATA: ListenerMetadata = {
    id: 'container_on_entity_succeeded',
    logical_component: 'container',
    description: 'Fills the database when `ontobdc container --entity` worked.',
    arguments: [
      {
        listen: [EVENT],
        valued: false,
        description: 'A command ran and worked; the result says which one.',
        type: 'str',
      },
    ],
  };

  private readonly payload: Payload | undefined;

  constructor(event: AppEvent) {
    this.payload = event.payload as Payload | undefined;
  }

  /** Publishes the groups the command answered, or says it could not read them. */
  run(): void {
    const success = this.payload;
    if (success?.result.stdin !== CONTAINER_ENTITY_COMMAND) return;

    const groups = entityGroupsOf(success.result.stdout);
    if (groups) eventBus.publish('presentation.container.entities.found', 'container_on_entity_succeeded', { groups });
    else eventBus.publish('presentation.container.entities.failed', 'container_on_entity_succeeded', { message: 'The entity command did not answer with datasets.' });
  }
}
