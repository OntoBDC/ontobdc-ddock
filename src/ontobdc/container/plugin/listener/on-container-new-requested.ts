import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { openContainer, workspaceContainerSource } from '@/ontobdc/shared/adapter/container-source';
import { NewContainerMachine } from '@/ontobdc/container/plugin/machine/new_container/machine';
import { ContainerCreationCancelledError } from '@/ontobdc/shared/domain/exception/container-creation';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const NEW_REQUESTED = 'presentation.container.new.requested';
const SOURCE = 'container_on_new_requested';

type NewRequested = AppEventMap[typeof NEW_REQUESTED];

export class OnContainerNewRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Creates the container the person names, in the folder they pick, and opens it.',
    arguments: [
      {
        listen: [NEW_REQUESTED],
        valued: true,
        parameter: 'name',
        description: 'Name of the new container: the single directory it is created in.',
        type: 'str',
      },
    ],
  };

  private readonly request: NewRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as NewRequested | undefined;
  }

  /**
   * Hands the request to the machine of the new container, which does the work
   * and publishes `create.started`. When the machine is done, opens the container
   * it made, which publishes `local.opened` or, if it cannot, `open.failed`.
   * What goes wrong is told here: `create.cancelled` when the picker was
   * closed, `create.failed` with the message otherwise.
   */
  async run(): Promise<void> {
    if (!this.request?.name) throw new Error('The new container request carries no name.');

    try {
      const machine = new NewContainerMachine(this.request);
      await machine.execute();

      const root = machine.rootFolder();
      if (!root) throw new Error('There is no folder to open the container from.');
      const folder = (await ContainerFileRepository.of(root).directory(this.request.name.trim())).handle;
      await openContainer(workspaceContainerSource(folder, root), SOURCE);
    } catch (error) {
      if (error instanceof ContainerCreationCancelledError) {
        eventBus.publish('presentation.container.create.cancelled', SOURCE);
      } else {
        eventBus.publish('presentation.container.create.failed', SOURCE, { message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}
