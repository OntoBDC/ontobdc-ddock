import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { entityGroupsOf } from '@/ontobdc/shared/adapter/container-format';
import { daysOf } from '@/ontobdc/shared/adapter/history-calendar';
import { HISTORY_DAYS_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const ENTITIES_FOUND = 'presentation.container.entities.found';
const GROUP_ACTIVATED = 'presentation.explorer.group.activated';
const SOURCE = 'container_on_history_requested';

export class OnHistoryRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Reads the days saved in the container when the container is read or the history is opened.',
    arguments: [
      {
        listen: [ENTITIES_FOUND, GROUP_ACTIVATED],
        valued: false,
        description: 'The entities of the container were found, or the user opened a group of the explorer.',
        type: 'str',
      },
    ],
  };

  private readonly event: AppEvent;

  constructor(event: AppEvent) {
    this.event = event;
  }

  /** Asks for `ontobdc container --entity Day --list` and publishes the days it answers; a failure leaves the calendars as they were. */
  async run(): Promise<void> {
    if (this.event.type === GROUP_ACTIVATED && (this.event.payload as { group?: string } | undefined)?.group !== 'history') return;

    try {
      const result = await requestCommand(HISTORY_DAYS_COMMAND, SOURCE);
      const groups = entityGroupsOf(result.stdout);
      if (groups) eventBus.publish('presentation.container.days.found', SOURCE, { days: daysOf(groups) });
    } catch {
      // The container has no days to read yet, or the command is not there: nothing to highlight.
    }
  }
}
