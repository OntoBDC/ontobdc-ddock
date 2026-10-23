import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { Mountable } from '@/ontobdc/shared/adapter/view';
import type { CommandQueueItem, CommandQueueSnapshot, CommandQueueStatus } from '@/ontobdc/shared/domain/model/command-queue';
import { translate, type MessageKey } from '@/ontobdc/shared/plugin/i18n';

const STATUS_LABEL: Record<CommandQueueStatus, MessageKey> = {
  queued: 'queue.status.queued',
  running: 'queue.status.running',
  done: 'queue.status.done',
  failed: 'queue.status.failed',
};
const REJECTED_LIMIT = 50;
const requestedCommands = new Map<string, string>();
const rejectedHistory: CommandQueueItem[] = [];

// The plugin keeps listening after Dockview disposes the mounted panel.
let reopenScheduled = false;
let pluginDisposed = false;
const unsubscribeReopening = eventBus.subscribe('presentation.main.panel.closed', ({ payload }) => {
  if (payload?.id !== 'queue' || reopenScheduled) return;
  reopenScheduled = true;
  // Reopen after Dockview finishes removing the old tab, regardless of container state.
  queueMicrotask(() => {
    reopenScheduled = false;
    if (pluginDisposed) return;
    eventBus.publish('presentation.main.panel.open.requested', 'queue', {
      container: 'bottom',
      id: 'queue',
      component: 'queue',
      title: translate('queue.tab'),
    });
  });
});

if (import.meta.hot) import.meta.hot.dispose(() => {
  pluginDisposed = true;
  unsubscribeReopening();
});

/**
 * The queue tab. It only shows: the command the runtime is running, the ones
 * waiting for it, and how each one ended. It runs nothing and publishes nothing
 * but the request for the queue as it is when it is mounted.
 */
export default function makeQueue(): Mountable {
  const root = document.createElement('div');
  root.className = 'panel-content command-queue-panel';
  root.innerHTML = '<div class="command-queue-output" id="command-queue-output"></div>';
  const output = root.querySelector<HTMLDivElement>('#command-queue-output');
  let lastSnapshot: CommandQueueSnapshot = { running: null, waiting: [], finished: [] };

  const render = (snapshot: CommandQueueSnapshot): void => {
    if (!output) return;
    lastSnapshot = snapshot;
    output.replaceChildren();
    const items: CommandQueueItem[] = [
      ...(snapshot.running ? [snapshot.running] : []),
      ...snapshot.waiting,
      ...snapshot.finished,
      ...rejectedHistory,
    ];
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-queue-empty';
      empty.textContent = translate('queue.empty');
      output.appendChild(empty);
      return;
    }
    for (const item of items) output.appendChild(queueRow(item));
  };

  const unsubscribe = [
    eventBus.subscribe('presentation.python.queue.changed', ({ payload }) => {
      if (payload) render(payload);
    }),
    eventBus.subscribe('presentation.main.command.requested', ({ payload }) => {
      if (!payload) return;
      requestedCommands.set(payload.requestId, payload.command);
    }),
    eventBus.subscribe('presentation.main.code.success', ({ payload }) => {
      if (payload) requestedCommands.delete(payload.requestId);
    }),
    eventBus.subscribe('presentation.main.code.failure', ({ payload }) => {
      if (payload) requestedCommands.delete(payload.requestId);
    }),
    eventBus.subscribe('presentation.main.command.invalid', ({ payload }) => {
      if (!payload) return;
      rejectedHistory.push({
        requestId: payload.requestId,
        label: requestedCommands.get(payload.requestId) ?? payload.requestId,
        status: 'failed',
        detail: payload.reason,
      });
      requestedCommands.delete(payload.requestId);
      if (rejectedHistory.length > REJECTED_LIMIT) rejectedHistory.shift();
      render(lastSnapshot);
    }),
  ];
  const intervalId: number = window.setInterval(() => {
    if (lastSnapshot.running === null) return;
    render(lastSnapshot);
  }, 1000);
  // The panel may be mounted after the queue already holds something.
  eventBus.publish('presentation.python.queue.requested', 'queue');

  return {
    element: root,
    dispose: () => {
      unsubscribe.forEach((stop) => stop());
      window.clearInterval(intervalId);
      root.remove();
    },
  };
}

function queueRow(item: CommandQueueItem): HTMLElement {
  const line = document.createElement('div');
  line.className = `command-queue-row ${item.status}`;

  const status = document.createElement('span');
  status.className = 'queue-status';
  status.textContent = translate(STATUS_LABEL[item.status]);

  const label = document.createElement('span');
  label.className = 'queue-label';
  label.textContent = item.label;
  line.append(status, label);

  const detailText = queueDetail(item);
  if (detailText) {
    const detail = document.createElement('span');
    detail.className = 'queue-detail';
    detail.textContent = detailText;
    line.appendChild(detail);
  }
  return line;
}

function queueDetail(item: CommandQueueItem): string {
  if (item.status === 'running' && typeof item.startedAt === 'number') {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - item.startedAt) / 1000));
    return `${elapsedSeconds}s`;
  }
  return item.detail ?? '';
}
