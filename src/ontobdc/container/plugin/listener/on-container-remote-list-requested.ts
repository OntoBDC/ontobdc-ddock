import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { Config } from '@/ontobdc/shared/adapter/config';
import { RemoteContainerRepository } from '@/ontobdc/shared/adapter/remote-container-repository';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const LIST_REQUESTED = 'presentation.container.remote.list.requested';
const SOURCE = 'container_on_remote_list_requested';

export class OnContainerRemoteListRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Lists the containers of the server the person logged in to.',
    arguments: [
      {
        listen: [LIST_REQUESTED],
        valued: false,
        description: 'The person asked for the containers of the server.',
        type: 'str',
      },
    ],
  };

  /** Builds the URL of the list and has the repository read it; tells what came of it. */
  async run(): Promise<void> {
    try {
      const url = new URL(Config.url('server.containers'));
      url.searchParams.set('list', 'true');
      eventBus.publish('presentation.container.remote.list.succeeded', SOURCE, { containers: await new RemoteContainerRepository().list(url) });
    } catch (error) {
      eventBus.publish('presentation.container.remote.list.failed', SOURCE, { message: error instanceof Error ? error.message : String(error) });
    }
  }
}
