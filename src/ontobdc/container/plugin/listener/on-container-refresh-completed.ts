import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { CONTAINER_INSPECT_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const REFRESH_COMPLETED = 'presentation.container.refresh.completed';
type RefreshCompleted = AppEventMap[typeof REFRESH_COMPLETED];

export class OnContainerRefreshCompleted {
  static readonly METADATA: ListenerMetadata = {
    id: 'container_on_refresh_completed',
    logical_component: 'container',
    description: 'Asks for the inspection of the container once it was refreshed.',
    arguments: [
      {
        listen: [REFRESH_COMPLETED],
        valued: false,
        description: 'The container was refreshed.',
        type: 'str',
      },
    ],
  };

  private readonly payload: RefreshCompleted | undefined;

  constructor(event: AppEvent) {
    this.payload = event.payload as RefreshCompleted | undefined;
  }

  /** Requests `ontobdc container --inspect`; the terminal shows it and the run listener executes it. */
  run(): void {
    eventBus.publish('presentation.main.command.requested', 'container_on_refresh_completed', {
      requestId: crypto.randomUUID(),
      command: CONTAINER_INSPECT_COMMAND,
    });
  }
}
