import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { ContextRepository } from '@/ontobdc/shared/adapter/context';
import { runFeatureMessageQuery, waitForPythonReady } from '@/ontobdc/shared/adapter/command';
import { getLocale } from '@/ontobdc/shared/plugin/i18n';
import type { ContainerOpened } from '@/ontobdc/shared/domain/model/container';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import type {
  PythonFeatureDevice,
  PythonFeatureEnvironment,
} from '@/ontobdc/shared/domain/model/python-command';

const CONTAINER_OPENED = 'presentation.container.opened';
const MOBILE_VIEWPORT = '(max-width: 768px)';

export class OnContainerRemoteOpened {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_container_remote_opened',
    logical_component: 'web',
    description: 'Responds when a remote container is opened.',
    arguments: [
      {
        listen: ['presentation.container.remote.opened'],
        valued: false,
        description: 'A remote container was opened.',
        type: 'str',
      },
    ],
  };

  constructor(private readonly event: AppEvent<ContainerOpened>) {}

  async run(): Promise<void> {
    const container = this.event.payload;
    if (!container?.folder) throw new Error('The opened remote container carries no folder.');
    await new ContextRepository(container.folder).set('container_availability', 'remote');

    await this.publishContainerOpenedMessage(container.name);
  }

  private async publishContainerOpenedMessage(name: string): Promise<void> {
    const device: PythonFeatureDevice = window.matchMedia(MOBILE_VIEWPORT).matches ? 'Mobile' : 'Desktop';
    const environment: PythonFeatureEnvironment = 'Browser';

    await waitForPythonReady();
    const { text } = await runFeatureMessageQuery(
      OnContainerRemoteOpened.METADATA.id,
      CONTAINER_OPENED,
      device,
      environment,
      getLocale(),
      { access: 'remoto', name },
    );
    if (text === null) return;

    eventBus.publish('presentation.assistant.message.sent', OnContainerRemoteOpened.METADATA.id, { text });
  }
}
