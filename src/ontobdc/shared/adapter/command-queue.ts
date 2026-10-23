import type {
  CommandQueueItem,
  CommandQueueSnapshot,
  CommandQueueStatus,
} from '@/ontobdc/shared/domain/model/command-queue';

/** A command waiting for its turn on the interpreter, and how to put it to work. */
export type CommandQueueTask = {
  item: CommandQueueItem;
  run: () => void;
};

/** How many commands that are over the queue keeps for whoever shows them. */
const FINISHED_LIMIT = 50;

/**
 * Serializes the commands that share the single interpreter of the runtime, and
 * tells whoever listens what the queue looks like: the one running, the ones
 * waiting, and the ones already over. It runs nothing itself: the caller gives
 * each task the `run` that puts it to work. It knows no event bus.
 */
export class CommandQueue {
  private readonly waiting: CommandQueueTask[] = [];
  private readonly finished: CommandQueueItem[] = [];
  private active: CommandQueueTask | null = null;
  private draining = false;

  constructor(private readonly onChange: (snapshot: CommandQueueSnapshot) => void) {}

  /** Adds a command to the end of the queue, replacing older queued copies of the same command. */
  submit(task: CommandQueueTask, replacedDetail?: string): CommandQueueItem[] {
    if (this.holds(task.item.requestId)) return [];
    const replaced: CommandQueueItem[] = [];
    for (let index = this.waiting.length - 1; index >= 0; index -= 1) {
      if (this.waiting[index].item.label !== task.item.label) continue;
      const [removed] = this.waiting.splice(index, 1);
      removed.item.status = 'failed';
      if (replacedDetail !== undefined) removed.item.detail = replacedDetail;
      this.remember(removed.item);
      replaced.push(removed.item);
    }
    this.waiting.push(task);
    this.publish();
    this.drain();
    return replaced;
  }

  /** Marks the command that is running as over, and starts the next one. */
  settle(requestId: string, status: CommandQueueStatus, detail?: string): void {
    if (this.active?.item.requestId !== requestId) return;
    const item = this.active.item;
    item.status = status;
    if (detail !== undefined) item.detail = detail;
    else if (status === 'done' && typeof item.startedAt === 'number') {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - item.startedAt) / 1000));
      item.detail = `${elapsedSeconds}s`;
    }
    this.active = null;
    this.remember(item);
    this.publish();
    this.drain();
  }

  /** Fails every command that has not run yet, and the one running: the runtime it feeds is gone. */
  abort(message: string): void {
    const unfinished = [...this.waiting.map((task) => task.item), ...(this.active ? [this.active.item] : [])];
    this.waiting.length = 0;
    this.active = null;
    unfinished.forEach((item) => {
      item.status = 'failed';
      item.detail = message;
      this.remember(item);
    });
    if (unfinished.length > 0) this.publish();
  }

  /** The queue as it is now, with copies that a caller cannot change. */
  snapshot(): CommandQueueSnapshot {
    return {
      running: this.active ? { ...this.active.item } : null,
      waiting: this.waiting.map((task) => ({ ...task.item })),
      finished: this.finished.map((item) => ({ ...item })),
    };
  }

  private holds(requestId: string): boolean {
    return this.active?.item.requestId === requestId
      || this.waiting.some((task) => task.item.requestId === requestId);
  }

  private drain(): void {
    // Reentrant: a task that cannot be put to work settles itself before returning.
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.active === null && this.waiting.length > 0) {
        const task = this.waiting.shift();
        if (!task) break;
        task.item.status = 'running';
        task.item.startedAt = Date.now();
        this.active = task;
        this.publish();
        task.run();
      }
    } finally {
      this.draining = false;
    }
  }

  private remember(item: CommandQueueItem): void {
    this.finished.push(item);
    if (this.finished.length > FINISHED_LIMIT) this.finished.shift();
  }

  private publish(): void {
    this.onChange(this.snapshot());
  }
}
