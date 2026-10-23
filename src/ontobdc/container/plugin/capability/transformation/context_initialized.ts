import { runPythonCommand } from '@/ontobdc/shared/adapter/command';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { folderOf } from './folder';

/** Runs `ontobdc init` in the temporary folder. */
export class ContextInitializedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.context_initialized',
    description: 'Run ontobdc init in the temporary folder.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const { mount } = folderOf(context);
    const init = await runPythonCommand('container', ['ontobdc', 'init', '--json'], mount);
    if (init.code !== 0) throw new Error(init.stderr.trim() || `ontobdc init failed (exit ${init.code}).`);
    context.etl.write('remote_container_connection', context.requestId, context.state, {
      phase: 'done',
      entity: { argv: ['ontobdc', 'init'] },
      result: { code: init.code },
    });
  }
}
