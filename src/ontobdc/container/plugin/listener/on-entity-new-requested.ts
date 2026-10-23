import { failureMessage } from '@/ontobdc/shared/adapter/command-request';
import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { NewEntityMachine } from '@/ontobdc/container/plugin/machine/new_entity/machine';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const NEW_REQUESTED = 'presentation.entity.new.requested';
const SOURCE = 'container_on_entity_new_requested';

type NewRequested = AppEventMap[typeof NEW_REQUESTED];

export class OnEntityNewRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Starts a new entity of any type: makes sure the container has its dataset, reads its facade and opens the tab to fill it in.',
    arguments: [
      {
        listen: [NEW_REQUESTED],
        valued: true,
        parameter: 'entityType',
        description: 'Type of the entity to create. Optional when the request names a group.',
        type: 'str',
      },
      {
        listen: [NEW_REQUESTED],
        valued: true,
        parameter: 'group',
        description: 'Path, in the container, of a dataset that holds entities of the type. Optional when the request names the type.',
        type: 'str',
      },
    ],
  };

  private readonly request: NewRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as NewRequested | undefined;
  }

  /**
   * Hands the request to the machine of the new entity, which does the work. Nothing is created
   * here but, when the container had no dataset for the type, that empty dataset. What goes
   * wrong is told in `presentation.entity.new.failed`.
   */
  async run(): Promise<void> {
    if (!this.request?.entityType && !this.request?.group) throw new Error('The request for a new entity carries neither a type nor a group.');

    try {
      await new NewEntityMachine(this.request).execute();
    } catch (error) {
      eventBus.publish('presentation.entity.new.failed', SOURCE, { message: failureMessage(error) });
    }
  }
}
