import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { CONTAINER_REFRESH_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const CODE_SUCCESS = 'presentation.main.code.success';
type CodeSuccess = AppEventMap[typeof CODE_SUCCESS];

export class OnContainerRefreshSucceeded {
  static readonly METADATA: ListenerMetadata = {
    id: 'container_on_refresh_succeeded',
    logical_component: 'container',
    description: 'Announces that the container was refreshed when `ontobdc container --refresh` worked.',
    arguments: [
      {
        listen: [CODE_SUCCESS],
        valued: false,
        description: 'A command ran and worked; the result says which one.',
        type: 'str',
      },
    ],
  };

  private readonly payload: CodeSuccess | undefined;

  constructor(event: AppEvent) {
    this.payload = event.payload as CodeSuccess | undefined;
  }

  /** Turns the success of the refresh command into the domain event the next steps wait for. */
  run(): void {
    const success = this.payload;
    if (success?.result.stdin !== CONTAINER_REFRESH_COMMAND) return;

    eventBus.publish('presentation.container.refresh.completed', 'container_on_refresh_succeeded', { requestId: success.requestId });
  }
}
