import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { commandCacheKey, commandCache } from '@/ontobdc/shared/adapter/command-cache';
import { CommandQueue } from '@/ontobdc/shared/adapter/command-queue';
import { commandWritesToMount } from '@/ontobdc/shared/adapter/python-sync';
import type { PythonWorkerRequest, PythonWorkerResponse } from '@/ontobdc/shared/domain/model/python-message';

type PendingKind = 'command' | 'feature-message' | 'package-versions';

const UNAVAILABLE = 'Python is unavailable. Reload the page to start it.';
const SUPERSEDED = 'A newer identical command replaced this queued command.';
/** What the queue shows for a command that did not reach the interpreter: its answer was already known. */
const CACHED = 'cache';

/** Register the runtime and command bridge; startup is triggered only by the layout event. */
export function initPython(): () => void {
  let ready = false;
  let worker: Worker | null = null;
  /** Every request the queue holds or runs, by the kind of answer it waits for. */
  const kinds = new Map<string, PendingKind>();
  /**
   * The requests that asked for what is already running, by the id of the one running: they are not queued,
   * and get the answer of the running one, as if they had run themselves.
   */
  const followers = new Map<string, string[]>();
  /** Under which key the answer of each command that only reads is to be kept, by the request that asked for it. */
  const cacheKeys = new Map<string, string>();
  const queue = new CommandQueue((snapshot) => {
    eventBus.publish('presentation.python.queue.changed', 'python', snapshot);
  });

  const publishFailure = (kind: PendingKind, requestId: string, message: string): void => {
    if (kind === 'feature-message') {
      eventBus.publish('presentation.brasidatacenter.message.failed', 'python', { requestId, message });
    } else if (kind === 'package-versions') {
      eventBus.publish('presentation.python.packages.failed', 'python', { requestId, message });
    } else {
      eventBus.publish('presentation.python.command.failed', 'python', { requestId, message });
    }
  };
  /** Reports a request that never reached the worker, freeing its place in the queue. */
  const reject = (requestId: string, kind: PendingKind, message: string): void => {
    kinds.delete(requestId);
    cacheKeys.delete(requestId);
    queue.settle(requestId, 'failed', message);
    publishFailure(kind, requestId, message);
    releaseFollowers(requestId, (follower) => publishFailure('command', follower, message));
  };
  /** Gives each request that followed the running one its answer. */
  const releaseFollowers = (runningId: string, answer: (followerId: string) => void): void => {
    for (const follower of followers.get(runningId) ?? []) {
      kinds.delete(follower);
      answer(follower);
    }
    followers.delete(runningId);
  };
  const failRequests = (message: string): void => {
    const requests = [...kinds];
    kinds.clear();
    followers.clear();
    cacheKeys.clear();
    queue.abort(message);
    requests.forEach(([requestId, kind]) => publishFailure(kind, requestId, message));
  };
  const fail = (message: string): void => {
    worker?.terminate();
    worker = null;
    ready = false;
    eventBus.publish('presentation.python.failed', 'python', { message });
    failRequests(message);
  };
  /** Queues a request: it goes to the worker when it is its turn, never before. */
  const submit = (
    requestId: string,
    label: string,
    kind: PendingKind,
    build: () => PythonWorkerRequest,
    readOnly = false,
    cacheKey?: string,
  ): void => {
    kinds.set(requestId, kind);
    // The same command that is running right now, and only reads: its answer is the answer of this one too.
    const running = queue.snapshot().running;
    if (readOnly && running?.label === label) {
      followers.set(running.requestId, [...(followers.get(running.requestId) ?? []), requestId]);
      return;
    }
    if (cacheKey !== undefined) cacheKeys.set(requestId, cacheKey);
    const replacedItems = queue.submit({
      item: { requestId, label, status: 'queued' },
      run: () => {
        // Read now, not when it was asked: a command that changes the container may have dropped it while this one waited its turn.
        const cached = cacheKey === undefined ? undefined : commandCache.get(cacheKey);
        if (cached !== undefined) {
          // It never reaches the worker, so the answer is not written back: it still takes its turn, and is over as soon as it gets it.
          cacheKeys.delete(requestId);
          queue.settle(requestId, 'done', CACHED);
          eventBus.publish('presentation.python.command.completed', 'python', { requestId, ...cached });
          return;
        }
        const active = worker;
        if (!active) return reject(requestId, kind, UNAVAILABLE);
        try {
          active.postMessage(build());
        } catch (error) {
          reject(requestId, kind, error instanceof Error ? error.message : String(error));
        }
      },
    }, SUPERSEDED);
    replacedItems.forEach((replacedItem) => {
      const replacedKind = kinds.get(replacedItem.requestId);
      if (replacedKind === undefined) return;
      kinds.delete(replacedItem.requestId);
      cacheKeys.delete(replacedItem.requestId);
      publishFailure(replacedKind, replacedItem.requestId, SUPERSEDED);
    });
  };

  const unsubscribe = [
    eventBus.subscribe('presentation.python.state.requested', () => {
      eventBus.publish('presentation.python.state.reported', 'python', { ready });
    }),
    eventBus.subscribe('presentation.python.command.requested', ({ payload }) => {
      if (!payload) return;
      const readOnly = !commandWritesToMount(payload.argv);
      submit(
        payload.requestId,
        payload.argv.join(' '),
        'command',
        () => ({ type: 'run', ...payload }),
        readOnly,
        readOnly ? commandCacheKey(payload.argv, payload.mount) : undefined,
      );
    }),
    eventBus.subscribe('presentation.brasidatacenter.message.requested', ({ payload }) => {
      if (!payload) return;
      submit(payload.requestId, payload.identifier, 'feature-message', () => ({ type: 'feature-message', ...payload }));
    }),
    eventBus.subscribe('presentation.python.packages.requested', ({ payload }) => {
      if (!payload) return;
      submit(payload.requestId, payload.packages.join(', '), 'package-versions', () => ({ type: 'package-versions', ...payload }));
    }),
    // The folder of the container changed by other means than a command: the runtime reads what differs.
    eventBus.subscribe('presentation.python.mount.invalidated', ({ payload }) => {
      worker?.postMessage({ type: 'invalidate', ...(payload?.paths ? { paths: payload.paths } : {}) } satisfies PythonWorkerRequest);
    }),
    eventBus.subscribe('presentation.explorer.file.uploaded', ({ payload }) => {
      const directory = (payload?.path ?? '').split('/').filter(Boolean).join('/');
      const files = payload?.files ?? [];
      if (files.length > 0) worker?.postMessage({ type: 'invalidate', paths: files.map((name) => (directory ? `${directory}/${name}` : name)) } satisfies PythonWorkerRequest);
    }),
    eventBus.subscribe('presentation.python.queue.requested', () => {
      eventBus.publish('presentation.python.queue.changed', 'python', queue.snapshot());
    }),
    eventBus.subscribe('presentation.main.layout.loaded', () => {
      if (worker) return;
      eventBus.publish('presentation.python.loading', 'python');
      try {
        worker = new Worker(new URL('./python-worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }: MessageEvent<PythonWorkerResponse>) => {
          if (data.type === 'failed') return fail(data.message);
          if (data.type === 'ready') {
            ready = true;
            eventBus.publish('presentation.python.ready', 'python', { ontobdcVersion: data.ontobdcVersion });
            return;
          }
          const kind = kinds.get(data.requestId);
          if (kind === undefined) return;
          kinds.delete(data.requestId);
          const cacheKey = cacheKeys.get(data.requestId);
          cacheKeys.delete(data.requestId);
          if (data.type === 'result') {
            // Kept only when it worked and only reads: what it answered is how the container is.
            if (data.code === 0 && cacheKey !== undefined) {
              commandCache.set(cacheKey, { code: data.code, stdout: data.stdout, stderr: data.stderr });
            }
            // Told before the queue moves on: whoever hears it drops what the container answered, and the command
            // that takes the turn after this one must not be answered with what this one changed.
            eventBus.publish('presentation.python.command.completed', 'python', {
              requestId: data.requestId, code: data.code, stdout: data.stdout, stderr: data.stderr,
            });
            // A command that ran and did not work is a failure in the queue, with the exit code, not a success.
            if (data.code === 0) queue.settle(data.requestId, 'done');
            else queue.settle(data.requestId, 'failed', `Exit code ${data.code}`);
            releaseFollowers(data.requestId, (follower) => eventBus.publish('presentation.python.command.completed', 'python', {
              requestId: follower, code: data.code, stdout: data.stdout, stderr: data.stderr,
            }));
          } else if (data.type === 'feature-message-result') {
            queue.settle(data.requestId, 'done');
            eventBus.publish('presentation.brasidatacenter.message.completed', 'python', {
              requestId: data.requestId, text: data.text,
            });
          } else if (data.type === 'package-versions-result') {
            queue.settle(data.requestId, 'done');
            eventBus.publish('presentation.python.packages.completed', 'python', {
              requestId: data.requestId, versions: data.versions,
            });
          } else {
            queue.settle(data.requestId, 'failed', data.message);
            publishFailure(kind, data.requestId, data.message);
            releaseFollowers(data.requestId, (follower) => publishFailure('command', follower, data.message));
          }
        };
        worker.onerror = (event) => {
          event.preventDefault();
          fail(event.message || 'The Python worker failed to start.');
        };
        worker.onmessageerror = () => fail('Unable to read a message from the Python worker.');
        worker.postMessage({ type: 'start' } satisfies PythonWorkerRequest);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    }),
  ];

  // Back on the page after being away: the folder may have been changed by someone else meanwhile.
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') worker?.postMessage({ type: 'invalidate' } satisfies PythonWorkerRequest);
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    unsubscribe.forEach((dispose) => dispose());
    const wasActive = worker !== null;
    worker?.terminate();
    worker = null;
    ready = false;
    if (wasActive) eventBus.publish('presentation.python.disconnected', 'python');
    failRequests('The Python runtime was stopped.');
  };
}
