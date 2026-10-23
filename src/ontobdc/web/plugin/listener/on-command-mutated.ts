import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { commandCache } from '@/ontobdc/shared/adapter/command-cache';
import { commandWritesToMount } from '@/ontobdc/shared/adapter/python-sync';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const COMMAND_REQUESTED = 'presentation.python.command.requested';
const COMMAND_COMPLETED = 'presentation.python.command.completed';
const COMMAND_FAILED = 'presentation.python.command.failed';
const SOURCE = 'web_on_command_mutated';

type CommandRequested = AppEventMap[typeof COMMAND_REQUESTED];

/**
 * A command that changes the container was requested. When it works, what the
 * commands that only read answered no longer holds. A command that only reads
 * changes nothing, and one that failed changed nothing either.
 */
export class OnCommandMutated {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'web',
    description: 'Clears the cache of the answers of the commands when a command that changes the container works.',
    arguments: [{
      listen: [COMMAND_REQUESTED],
      valued: true,
      parameter: 'requestId',
      description: 'Id of the command that was requested.',
      type: 'str',
    }],
  };

  private readonly request: CommandRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as CommandRequested | undefined;
  }

  /** Waits for the answer of the command it was built for, and clears the cache when it worked. */
  run(): void {
    const request = this.request;
    if (!request?.requestId || !commandWritesToMount(request.argv)) return;

    const stop = (): void => {
      unsubscribeCompleted();
      unsubscribeFailed();
    };
    const unsubscribeCompleted = eventBus.subscribe(COMMAND_COMPLETED, ({ payload }) => {
      if (payload?.requestId !== request.requestId) return;
      stop();
      if (payload.code === 0) commandCache.clear();
    });
    const unsubscribeFailed = eventBus.subscribe(COMMAND_FAILED, ({ payload }) => {
      if (payload?.requestId !== request.requestId) return;
      stop();
    });
  }
}
