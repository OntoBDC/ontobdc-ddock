import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { CONTAINER_ENTITY_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const EVENT = 'presentation.container.refresh.completed';
type Payload = AppEventMap[typeof EVENT];

export class OnContainerRefreshCompletedEntity {
  static readonly METADATA: ListenerMetadata = {
    id: 'container_on_refresh_completed_entity',
    logical_component: 'container',
    description: 'Asks for the entities of the container once it was refreshed.',
    arguments: [
      {
        listen: [EVENT],
        valued: false,
        description: 'The container was refreshed.',
        type: 'str',
      },
    ],
  };

  private readonly payload: Payload | undefined;

  constructor(event: AppEvent) {
    this.payload = event.payload as Payload | undefined;
  }

  /** Requests `ontobdc container --entity`; the terminal shows it and the run listener executes it. */
  run(): void {
    eventBus.publish('presentation.main.command.requested', 'container_on_refresh_completed_entity', {
      requestId: crypto.randomUUID(),
      command: CONTAINER_ENTITY_COMMAND,
    });
  }
}
