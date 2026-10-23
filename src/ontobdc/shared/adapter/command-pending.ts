import { eventBus } from '@/ontobdc/shared/adapter/event-bus';

/**
 * Tells whether a command is still running, from the events of its request and of its answer: it is
 * pending from the moment it is requested until it worked, failed or was found invalid. `matches`
 * picks the commands by the line that was requested; `onChange` is called with the new state, and
 * only when it changes. Returns what stops the watching.
 */
export function watchCommand(matches: (command: string) => boolean, onChange: (pending: boolean) => void): () => void {
  const running = new Set<string>();
  let pending = false;
  const update = (): void => {
    if (pending === running.size > 0) return;
    pending = running.size > 0;
    onChange(pending);
  };
  const finished = (requestId: string | undefined): void => {
    if (requestId && running.delete(requestId)) update();
  };

  const unsubscribe = [
    eventBus.subscribe('presentation.main.command.requested', ({ payload }) => {
      if (!payload || !matches(payload.command)) return;
      running.add(payload.requestId);
      update();
    }),
    eventBus.subscribe('presentation.main.code.success', ({ payload }) => finished(payload?.requestId)),
    eventBus.subscribe('presentation.main.code.failure', ({ payload }) => finished(payload?.requestId)),
    eventBus.subscribe('presentation.main.command.invalid', ({ payload }) => finished(payload?.requestId)),
  ];
  return () => unsubscribe.forEach((dispose) => dispose());
}

/** The rows of a list that is being read: grey bars that pulse, in place of the items. */
export function listSkeleton(rows = 4): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = 'list-skeleton';
  skeleton.setAttribute('role', 'status');
  skeleton.setAttribute('aria-busy', 'true');
  for (let index = 0; index < rows; index += 1) {
    const line = document.createElement('span');
    line.className = 'list-skeleton-line';
    skeleton.appendChild(line);
  }
  return skeleton;
}
