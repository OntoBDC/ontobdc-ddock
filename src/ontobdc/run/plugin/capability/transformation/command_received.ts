import { commandPrograms } from '@/ontobdc/shared/adapter/command-rewriter';
import { splitCommandLine } from '@/ontobdc/shared/adapter/command-line';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { CommandInvalidError } from '@/ontobdc/shared/domain/exception/command-execution';

const JSON_FLAG = '--json';

/** Accepts the command, or rejects it with the reason. */
export class CommandReceivedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.run.plugin.capability.transformation.target.command_received',
    description: 'Accept the requested command: only a plain command of a program of the runtime can run.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const command = context.parameters.command ?? '';
    let argv: string[];
    try {
      argv = splitCommandLine(command);
    } catch (error) {
      throw new CommandInvalidError(error instanceof Error ? error.message : String(error));
    }
    if (argv.length === 0) throw new CommandInvalidError('The command is empty.');
    const programs = commandPrograms();
    if (!programs.includes(argv[0])) throw new CommandInvalidError(`Only ${programs.join(', ')} commands can run here.`);
    const sanitizedArgv: string[] = argv.filter((argument: string) => argument !== JSON_FLAG);

    context.etl.write('local_command_execution', context.requestId, context.state, {
      phase: 'done',
      entity: { command },
      result: { argv: sanitizedArgv },
    });
  }
}
