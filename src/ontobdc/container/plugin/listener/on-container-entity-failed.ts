import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { CONTAINER_ENTITY_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const EVENT = 'presentation.main.code.failure';
type Payload = AppEventMap[typeof EVENT];

export class OnContainerEntityFailed {
  static readonly METADATA: ListenerMetadata = {
    id: 'container_on_entity_failed',
    logical_component: 'container',
    description: 'Tells the database that `ontobdc container --entity` failed.',
    arguments: [
      {
        listen: [EVENT],
        valued: false,
        description: 'A command ran and did not work; the result says which one.',
        type: 'str',
      },
    ],
  };

  private readonly payload: Payload | undefined;

  constructor(event: AppEvent) {
    this.payload = event.payload as Payload | undefined;
  }

  /** Publishes why the entities could not be read. */
  run(): void {
    const failure = this.payload;
    if (failure?.result?.stdin !== CONTAINER_ENTITY_COMMAND) return;

    eventBus.publish('presentation.container.entities.failed', 'container_on_entity_failed', { message: failure.message });
  }
}
