import type { CommandExecutionResult } from '@/ontobdc/shared/domain/model/command-execution';

/** A command ran and did not work; `result` is what it left, when it left one. */
export class CommandFailedError extends Error {
  constructor(message: string, readonly result: CommandExecutionResult | null) {
    super(message);
    this.name = 'CommandFailedError';
  }
}
