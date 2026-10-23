import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { ContextRepository } from '@/ontobdc/shared/adapter/context';
import { runFeatureMessageQuery, waitForPythonReady } from '@/ontobdc/shared/adapter/command';
import { getLocale } from '@/ontobdc/shared/plugin/i18n';
import { CONTAINER_REFRESH_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { ContainerOpened } from '@/ontobdc/shared/domain/model/container';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import type {
  PythonFeatureDevice,
  PythonFeatureEnvironment,
} from '@/ontobdc/shared/domain/model/python-command';

const CONTAINER_OPENED = 'presentation.container.opened';
const MOBILE_VIEWPORT = '(max-width: 768px)';

export class OnContainerLocalOpened {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_container_local_opened',
    logical_component: 'web',
    description: 'Responds when a local container is opened.',
    arguments: [
      {
        listen: ['presentation.container.local.opened'],
        valued: false,
        description: 'A local container was opened.',
        type: 'str',
      },
    ],
  };

  constructor(private readonly event: AppEvent<ContainerOpened>) {}

  async run(): Promise<void> {
    const container = this.event.payload;
    if (container?.access === 'read') return;
    if (!container?.folder) throw new Error('The opened local container carries no folder.');
    await new ContextRepository(container.folder).set('container_availability', 'local');

    // The terminal shows this command and the run listener executes it, as both hear the same event.
    eventBus.publish('presentation.main.command.requested', 'web_on_container_local_opened', {
      requestId: crypto.randomUUID(),
      command: CONTAINER_REFRESH_COMMAND,
    });

    await this.publishContainerOpenedMessage(container.name);
  }

  private async publishContainerOpenedMessage(name: string): Promise<void> {
    const device: PythonFeatureDevice = window.matchMedia(MOBILE_VIEWPORT).matches ? 'Mobile' : 'Desktop';
    const environment: PythonFeatureEnvironment = 'Browser';

    await waitForPythonReady();
    const { text } = await runFeatureMessageQuery(
      OnContainerLocalOpened.METADATA.id,
      CONTAINER_OPENED,
      device,
      environment,
      getLocale(),
      { access: 'local', name },
    );
    if (text === null) return;

    eventBus.publish('presentation.assistant.message.sent', OnContainerLocalOpened.METADATA.id, { text });
  }
}
