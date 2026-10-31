import { PyodideCommandExecutionAdapter } from '@/ontobdc/shared/adapter/pyodide-command-execution';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import type { CommandExecutionAdapter } from '@/ontobdc/shared/domain/port/command-execution';

/** Runs the command in the Python runtime and records the response, without analyzing it. */
export class CommandRunnableOnPyodideCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.run.plugin.capability.transformation.target.command_runnable_on_pyodide',
    description: 'Run the command in the Python runtime of the browser and record the response.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const received = context.etl.read('local_command_execution', context.requestId, 'command_received');
    const argv = (received?.result as { argv: string[] } | undefined)?.argv;
    if (!argv) throw new Error('The command was not received.');

    const adapter: CommandExecutionAdapter = new PyodideCommandExecutionAdapter();
    const result = await adapter.execute(context.parameters.requestId ?? '', context.parameters.command ?? '', argv, context.parameters.container === 'none' ? 'none' : undefined);
    context.etl.write('local_command_execution', context.requestId, context.state, {
      phase: 'done',
      entity: { argv },
      result,
    });
  }
}
