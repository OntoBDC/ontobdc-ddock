import { Config } from '@/ontobdc/shared/adapter/config';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

const machine = (context: CapabilityContext): string => {
  if (!context.machine) throw new Error('The context of the capability carries no machine.');
  return context.machine;
};

/** Identifies the URL of the server the person logs in to. */
export class ServerUrlIdentifiedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.user.plugin.capability.transformation.target.server_url_identified',
    description: 'Identify the URL of the server to log in to: the one in the config.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  /** Reads the URL of the server from the config. */
  async execute(context: CapabilityContext): Promise<void> {
    context.etl.write(machine(context), context.requestId, context.state, {
      phase: 'done',
      entity: { name: 'server_url' },
      result: { url: Config.url('server.url') },
    });
  }
}
