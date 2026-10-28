import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { isNoticedInQueue } from '@/ontobdc/shared/adapter/queue-notice';
import { notify } from '@/ontobdc/shared/adapter/notice';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const COMMAND_REQUESTED = 'presentation.main.command.requested';
const QUEUE_CHANGED = 'presentation.python.queue.changed';
const QUEUE_REQUESTED = 'presentation.python.queue.requested';
const SOURCE = 'web_on_command_queued';

/** How long the listener looks for the command in the queue before it gives up: the runtime may still be loading, and the queue only knows the command when it is ready. */
const LOOK_MS = 60000;

type CommandRequested = AppEventMap[typeof COMMAND_REQUESTED];

export class OnCommandQueued {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'web',
    description: 'Tells the person, in a notice, that what they asked for waits in the queue of commands, and where to follow it.',
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

  /**
   * For a command that an addon asks to be told about (a long one), looks at the queue: when it is not the one running but
   * waits behind another, the person is told, so they know it was heard and where to follow it.
   * A command that starts at once needs no notice.
   */
  run(): void {
    const { requestId, command } = this.request ?? {};
    if (!requestId || !command || !isNoticedInQueue(` ${command}`)) return;

    const stop = (): void => {
      unsubscribe();
      window.clearTimeout(timer);
    };
    const unsubscribe = eventBus.subscribe(QUEUE_CHANGED, ({ payload }) => {
      if (payload?.running?.requestId === requestId) { stop(); return; }
      if (!payload?.waiting.some((item) => item.requestId === requestId)) return;
      stop();
      notify(translate('notice.command.queued', { queue: translate('queue.tab') }), 'info');
    });
    const timer = window.setTimeout(stop, LOOK_MS);
    // The command may already be in the queue: ask for it as it is now.
    eventBus.publish(QUEUE_REQUESTED, SOURCE);
  }
}
