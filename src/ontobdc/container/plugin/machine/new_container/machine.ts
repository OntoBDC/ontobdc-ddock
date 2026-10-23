import { createActor, createMachine } from 'xstate';
import { TransformationCapabilityExecutor } from '@/ontobdc/shared/adapter/capability-executor';
import { StorageRoot } from '@/ontobdc/shared/adapter/storage-root';
import { Etl } from '@/ontobdc/shared/adapter/etl';
import type { NamedCall } from '@/ontobdc/shared/adapter/statechart-converter';
import type { NewContainerHandlerPort, NewContainerRequest } from './port';
import { NewContainerState, type NewContainerStateValue } from './state';
import { NewContainerStatechart } from './statechart';

/** Discover the capabilities of the module without executing them yet. */
const capabilityImports = import.meta.glob<Record<string, unknown>>('../../capability/transformation/*.ts');

const PORT_NAME = 'NewContainerStatePort';

/** `NewContainerStatePort.STORAGE_ROOT_DEFINED` into the state it names. */
const stateOf = (constant: string): NewContainerStateValue => {
  const [port, name] = constant.split('.');
  const value = (NewContainerState as Record<string, NewContainerStateValue>)[name];
  if (port !== PORT_NAME || value === undefined) throw new Error(`Unknown state constant: ${constant}`);
  return value;
};

/**
 * Drives the statechart of the creation of a new container.
 *
 * The statechart decides which state comes next, and its guard asks whether
 * the state is the one that follows the current one. The capability of a state
 * is not listed anywhere: its id is the prefix plus the name of the state, and
 * the driver runs it before it lets the machine enter that state. A capability that
 * fails throws, and so does the machine: a state is only reached when it makes
 * sense to go on. A capability that throws
 * `ContainerCreationCancelledError` tells the caller the person gave up.
 */
export class NewContainerMachine implements NewContainerHandlerPort {
  static readonly NAME = 'new_container';
  static readonly CAPABILITY_ID_PREFIX = 'org.ontobdc.container.plugin.capability.transformation.target.';
  static readonly FINAL_STATE = NewContainerState.WORKSPACE_CONTAINER_HEALTHY;

  private active: NewContainerStateValue = NewContainerState.UNDEFINED;
  private root: FileSystemDirectoryHandle | undefined;
  private readonly capabilities = new TransformationCapabilityExecutor(capabilityImports);

  constructor(
    private readonly request: NewContainerRequest,
    private readonly etl: Etl = new Etl(),
  ) {}

  canTransitTo(state: NewContainerStateValue): boolean {
    const sequence = NewContainerStatechart.sequence();
    return sequence[sequence.indexOf(this.active) + 1] === state;
  }

  performStateTransition(state: NewContainerStateValue): void {
    this.active = state;
  }

  /** The folder the person picked as the root of the workspace, once the machine has run. */
  rootFolder(): FileSystemDirectoryHandle | undefined {
    return this.root;
  }

  /** Walks the statechart to its final state and returns it. */
  async execute(): Promise<NewContainerStateValue> {
    const requestId = crypto.randomUUID();
    const config = NewContainerStatechart.config();
    const sequence = NewContainerStatechart.sequence();

    const implement = (call: NamedCall): (() => boolean) | (() => void) => {
      const state = stateOf(call.params.to_state);
      if (call.type === 'handler.can_transit_to') return () => this.canTransitTo(state) !== call.negated;
      if (call.type === 'handler.perform_state_transition') return () => this.performStateTransition(state);
      throw new Error(`Unknown statechart call: ${call.type}`);
    };

    const machine = createMachine({
      id: config.id,
      initial: config.initial,
      states: Object.fromEntries(Object.entries(config.states).map(([name, node]) => [name, {
        ...(node.type ? { type: node.type } : {}),
        meta: node.meta,
        ...(node.on ? { on: { STEP: node.on.STEP.map((transition) => ({
          target: transition.target,
          ...(transition.guard ? { guard: implement(transition.guard) as () => boolean } : {}),
          ...(transition.actions ? { actions: transition.actions.map((action) => implement(action) as () => void) } : {}),
        })) } } : {}),
      }])),
    });

    const actor = createActor(machine);
    actor.start();
    try {
      while (actor.getSnapshot().status !== 'done') {
        const current = String(actor.getSnapshot().value);
        const next = sequence[sequence.indexOf(current) + 1];
        if (next === undefined) throw new Error(`The statechart has no state after ${current}.`);

        await this.runCapability(requestId, next as NewContainerStateValue);
        actor.send({ type: 'STEP' });
        if (String(actor.getSnapshot().value) === current) {
          throw new Error(`The statechart stayed in ${current} after the capability of ${next} ran.`);
        }
      }
    } finally {
      this.root = new StorageRoot({ etl: this.etl, requestId, machine: NewContainerMachine.NAME }).folder();
      actor.stop();
      this.etl.clear(NewContainerMachine.NAME, requestId);
    }

    return this.active;
  }

  /** Runs the capability of the state, unless it says the state already holds. */
  private async runCapability(requestId: string, state: NewContainerStateValue): Promise<void> {
    await this.capabilities.execute(`${NewContainerMachine.CAPABILITY_ID_PREFIX}${state}`, {
      requestId,
      state,
      machine: NewContainerMachine.NAME,
      etl: this.etl,
      parameters: { name: this.request.name.trim() },
    });
  }
}
