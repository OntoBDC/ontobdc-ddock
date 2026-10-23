import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { RemoteContainerConnectionMachine } from '@/ontobdc/container/plugin/machine/remote_container_connection/machine';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const CONNECT_REQUESTED = 'presentation.container.connect.requested';
const SOURCE = 'container_on_connect_requested';

type ConnectRequested = AppEventMap[typeof CONNECT_REQUESTED];

export class OnContainerConnectRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Connects to the container the person chose from the list of the server.',
    arguments: [
      {
        listen: [CONNECT_REQUESTED],
        valued: true,
        parameter: 'container',
        description: 'URI of the container, as the server lists it.',
        type: 'str',
      },
    ],
  };

  private readonly request: ConnectRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as ConnectRequested | undefined;
  }

  /** Hands the request to the connection machine, and tells what came of it. */
  async run(): Promise<void> {
    const container = this.request?.container;
    if (!container) return;

    try {
      const machine = new RemoteContainerConnectionMachine({ container });
      await machine.execute();
      eventBus.publish('presentation.container.remote.inspect.succeeded', SOURCE, { container, answer: machine.inspection() });
    } catch (error) {
      eventBus.publish('presentation.container.remote.inspect.failed', SOURCE, { container, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
