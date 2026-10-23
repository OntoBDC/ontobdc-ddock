import { runPythonCommand } from '@/ontobdc/shared/adapter/command';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { folderOf } from './folder';

/** Runs `ontobdc container --remote` in the temporary folder. */
export class RemoteContainerConnectedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.remote_container_connected',
    description: 'Run ontobdc container --remote in the temporary folder.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const url = context.parameters.url;
    if (!url) throw new Error('The connection has no URL.');
    const { mount } = folderOf(context);
    const connect = await runPythonCommand('container', ['ontobdc', 'container', '--remote', url, '--json'], mount);
    if (connect.code !== 0) {
      throw new Error(connect.stdout.trim() || connect.stderr.trim() || `ontobdc container --remote failed (exit ${connect.code}).`);
    }
    context.etl.write('remote_container_connection', context.requestId, context.state, {
      phase: 'done',
      entity: { url },
      result: { code: connect.code, stdout: connect.stdout },
    });
  }
}
