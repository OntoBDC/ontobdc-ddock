import { runPythonCommand, waitForPythonReady } from '@/ontobdc/shared/adapter/command';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import type { CommandExecutionResult, Json } from '@/ontobdc/shared/domain/model/command-execution';
import { CommandExecutionAdapter } from '@/ontobdc/shared/domain/port/command-execution';

const JSON_FLAG = '--json';

/** Where a command that needs no container runs when none is open. */
const NO_CONTAINER_DIRECTORY = '/tmp/no-container';

/** The output of the CLI as JSON when it is, as the text it printed when it is not; empty output is null. */
const jsonOf = (text: string): Json => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Json;
  } catch {
    return trimmed;
  }
};

/** Runs ontobdc commands in the Python runtime of the browser (Pyodide), in the opened container. */
export class PyodideCommandExecutionAdapter extends CommandExecutionAdapter {
  async execute(requestId: string, command: string, argv: string[], container?: 'none'): Promise<CommandExecutionResult> {
    const folder = ContainerRepository.getInstance().get()?.folder;
    // A command that needs no container still has to run somewhere: in an empty directory, which is gone when it ends.
    if (!folder && container !== 'none') throw new Error('No container is open, so there is nowhere to run the command.');

    await waitForPythonReady();
    const mount = folder ? { path: `/storage/${folder.name}`, handle: folder } : { path: NO_CONTAINER_DIRECTORY };
    const run = await runPythonCommand('run', [...argv, JSON_FLAG], mount, requestId || undefined);
    const stderr = jsonOf(run.stderr);
    return {
      requestId,
      // A run worked when the CLI exited with 0 and wrote nothing to stderr.
      success: run.code === 0 && stderr === null,
      code: run.code,
      stdin: command,
      stdout: jsonOf(run.stdout),
      stderr,
    };
  }
}
