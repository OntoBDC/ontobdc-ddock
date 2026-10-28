import { createActor, createMachine } from 'xstate';
import type { CapabilityContext } from '@/ontobdc/shared/domain/model/capability';
import type { ChainResponsibilityClass } from '@/ontobdc/shared/domain/model/chain';

/**
 * Runs the open-file chain: every capability that implements `canHandle` — in the
 * core transformation folder or in an addon — is one region of the parallel root.
 * A region asks `can_handle` and, when it holds, runs `execute_responsibility`.
 * The topology is the same for every responsibility, so the worker builds it from
 * the candidates and the YAML only names the chain.
 */
export class ChainOfResponsibilityWorkerAdapter {
  private readonly handled: string[] = [];
  private readonly instances = new Map<string, InstanceType<ChainResponsibilityClass>>();

  constructor(
    private readonly id: string,
    private readonly candidates: ChainResponsibilityClass[],
    private readonly context: CapabilityContext,
  ) {}

  async work(): Promise<string[]> {
    const pending: Array<Promise<void>> = [];

    const machine = createMachine({
      id: this.id,
      type: 'parallel',
      states: Object.fromEntries(this.candidates.map((candidate) => {
        const id = candidate.METADATA.id;
        const region = id.slice(id.lastIndexOf('.') + 1);
        const canHandle = this.responsibilityOf(id).canHandle(this.context);
        return [region, {
          initial: `${region}_pending`,
          states: {
            [`${region}_pending`]: {
              on: { STEP: [
                { target: `${region}_completed`, guard: () => canHandle, actions: [() => this.dispatch(id, pending)] },
                { target: `${region}_completed`, guard: () => !canHandle },
              ] },
            },
            [`${region}_completed`]: { type: 'final' as const },
          },
        }];
      })),
    });

    const actor = createActor(machine);
    actor.start();
    actor.send({ type: 'STEP' });
    await Promise.all(pending);
    actor.stop();

    return [...this.handled];
  }

  /** Runs the capability of the region and records it as handled. */
  private dispatch(id: string, pending: Array<Promise<void>>): void {
    pending.push(this.responsibilityOf(id).execute(this.context).then(() => { this.handled.push(id); }));
  }

  private responsibilityOf(id: string): InstanceType<ChainResponsibilityClass> {
    const existing = this.instances.get(id);
    if (existing) return existing;
    const found = this.candidates.find((candidate) => candidate.METADATA.id === id);
    if (!found) throw new Error(`Chain '${this.id}' has no capability with id '${id}'.`);
    const instance = new found();
    this.instances.set(id, instance);
    return instance;
  }
}
