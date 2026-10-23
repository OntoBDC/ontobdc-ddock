import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { CONTAINER_REFRESH_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const REFRESH_REQUESTED = 'presentation.container.refresh.requested';
const SOURCE = 'container_on_refresh_requested';

export class OnContainerRefreshRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Asks for `ontobdc container --refresh` when the person asks to refresh the container.',
    arguments: [
      {
        listen: [REFRESH_REQUESTED],
        valued: false,
        description: 'The person asked to refresh the container.',
        type: 'str',
      },
    ],
  };

  /** Requests the command; the terminal shows it and the run listener executes it, and its success is `refresh.completed`. */
  run(): void {
    eventBus.publish('presentation.main.command.requested', SOURCE, { requestId: crypto.randomUUID(), command: CONTAINER_REFRESH_COMMAND });
  }
}
