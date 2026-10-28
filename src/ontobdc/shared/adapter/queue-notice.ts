import type { QueueNotice } from '@/ontobdc/shared/domain/model/queue-notice';

/** The queue notices of the addons. */
const modules = import.meta.glob<QueueNotice>('@/addon/*/plugin/queue/*.ts', { eager: true });

/** Whether an addon asks for the person to be told when this command waits in the queue. */
export function isNoticedInQueue(command: string): boolean {
  return Object.values(modules).some((module) => module.noticed.some((pattern) => pattern.test(command)));
}
