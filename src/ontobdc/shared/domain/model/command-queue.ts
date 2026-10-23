/** How a command of the runtime is going: waiting for the interpreter, running on it, or over. */
export type CommandQueueStatus = 'queued' | 'running' | 'done' | 'failed';

/** One command waiting for, running on, or done with the single interpreter of the runtime. */
export type CommandQueueItem = {
  requestId: string;
  /** What the queue shows for it: the words of a CLI command, or the data a query asks for. */
  label: string;
  status: CommandQueueStatus;
  /** When it started on the interpreter, in milliseconds since epoch. */
  startedAt?: number;
  /** How it ended, once it ended: the exit code of a CLI command, or why it failed. */
  detail?: string;
};

/** The queue as it is now: the command running, the ones waiting, and the ones already over. */
export type CommandQueueSnapshot = {
  running: CommandQueueItem | null;
  waiting: CommandQueueItem[];
  finished: CommandQueueItem[];
};
