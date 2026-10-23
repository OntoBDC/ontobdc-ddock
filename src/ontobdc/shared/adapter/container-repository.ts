import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { ContainerOpened } from '@/ontobdc/shared/domain/model/container';

/**
 * Keeps the currently opened container in memory so capabilities and adapters
 * can read it synchronously without going through the event bus. The container
 * adapter still owns the truth and publishes it on open; this just caches it.
 */
export class ContainerRepository {
  private static instance: ContainerRepository | null = null;
  private current: ContainerOpened | null = null;
  private readonly unsubscribe: Array<() => void> = [];

  private constructor() {
    this.unsubscribe.push(
      eventBus.subscribe('presentation.container.local.opened', ({ payload }) => {
        this.current = payload ?? null;
      }),
      eventBus.subscribe('presentation.container.remote.opened', ({ payload }) => {
        this.current = payload ?? null;
      }),
      eventBus.subscribe('presentation.container.state.reported', ({ payload }) => {
        this.current = payload?.container ?? null;
      }),
    );
  }

  static getInstance(): ContainerRepository {
    if (!ContainerRepository.instance) ContainerRepository.instance = new ContainerRepository();
    return ContainerRepository.instance;
  }

  get(): ContainerOpened | null {
    return this.current;
  }

  dispose(): void {
    this.unsubscribe.forEach((dispose) => dispose());
    this.current = null;
    ContainerRepository.instance = null;
  }
}
