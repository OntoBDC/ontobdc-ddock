import { Config } from '@/ontobdc/shared/adapter/config';
import { RemoteContainerRepository } from '@/ontobdc/shared/adapter/remote-container-repository';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Inspects the container on the server: the same command as the list, with the container as a parameter. */
export class RemoteContainerInspectedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.remote_container_inspected',
    description: 'Ask the server to inspect the container the person chose.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    const container = context.parameters.container;
    if (!container) throw new Error('The connection has no container.');
    if (!context.machine) throw new Error('The context of the capability carries no machine.');

    const url = new URL(Config.url('server.containers'));
    url.searchParams.set('inspect', 'true');
    url.searchParams.set('container', container);
    const answer = await new RemoteContainerRepository().get(url);

    context.etl.write(context.machine, context.requestId, context.state, {
      phase: 'done',
      entity: { container },
      result: { answer },
    });
  }
}
