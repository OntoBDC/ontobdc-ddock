import { createActor, createMachine } from 'xstate';
import { TransformationCapabilityExecutor } from '@/ontobdc/shared/adapter/capability-executor';
import { Etl } from '@/ontobdc/shared/adapter/etl';
import type { NamedCall } from '@/ontobdc/shared/adapter/statechart-converter';
import type { RemoteContainerConnectionHandlerPort, RemoteContainerConnectionRequest } from './port';
import { RemoteContainerConnectionState, type RemoteContainerConnectionStateValue } from './state';
import { RemoteContainerConnectionStatechart } from './statechart';

/** Discover the capabilities of the module without executing them yet. */
const capabilityImports = import.meta.glob<Record<string, unknown>>('../../capability/transformation/*.ts');

const PORT_NAME = 'RemoteContainerConnectionStatePort';

/** `RemoteContainerConnectionStatePort.STORAGE_ROOT_DEFINED` into the state it names. */
const stateOf = (constant: string): RemoteContainerConnectionStateValue => {
  const [port, name] = constant.split('.');
  const value = (RemoteContainerConnectionState as Record<string, RemoteContainerConnectionStateValue>)[name];
  if (port !== PORT_NAME || value === undefined) throw new Error(`Unknown state constant: ${constant}`);
  return value;
};

/**
 * Drives the statechart of the login of the person.
 *
 * The statechart decides which state comes next, and its guard asks whether
 * the state is the one that follows the current one. The capability of a state
 * is not listed anywhere: its id is the prefix plus the name of the state, and
 * the driver runs it before it lets the machine enter that state. A capability that
 * fails throws, and so does the machine: a state is only reached when it makes
 * sense to go on. A capability that throws
 * `ContainerCreationCancelledError` tells the caller the person gave up.
 */
export class RemoteContainerConnectionMachine implements RemoteContainerConnectionHandlerPort {
  static readonly NAME = 'remote_container_connection';
  static readonly CAPABILITY_ID_PREFIX = 'org.ontobdc.container.plugin.capability.transformation.target.';
  static readonly FINAL_STATE = RemoteContainerConnectionState.REMOTE_CONTAINER_INSPECTED;

  private active: RemoteContainerConnectionStateValue = RemoteContainerConnectionState.UNDEFINED;
  private readonly capabilities = new TransformationCapabilityExecutor(capabilityImports);

  private answer: unknown;

  constructor(
    private readonly request: RemoteContainerConnectionRequest,
    private readonly etl: Etl = new Etl(),
  ) {}

  /** What the server answered the inspection of the container with, once the machine has run. */
  inspection(): unknown {
    return this.answer;
  }

  canTransitTo(state: RemoteContainerConnectionStateValue): boolean {
    const sequence = RemoteContainerConnectionStatechart.sequence();
    return sequence[sequence.indexOf(this.active) + 1] === state;
  }

  performStateTransition(state: RemoteContainerConnectionStateValue): void {
    this.active = state;
  }

  /** Walks the statechart to its final state and returns it. */
  async execute(): Promise<RemoteContainerConnectionStateValue> {
    const requestId = crypto.randomUUID();
    const config = RemoteContainerConnectionStatechart.config();
    const sequence = RemoteContainerConnectionStatechart.sequence();

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

        await this.runCapability(requestId, next as RemoteContainerConnectionStateValue);
        actor.send({ type: 'STEP' });
        if (String(actor.getSnapshot().value) === current) {
          throw new Error(`The statechart stayed in ${current} after the capability of ${next} ran.`);
        }
      }
    } finally {
      this.answer = (this.etl.read(RemoteContainerConnectionMachine.NAME, requestId, RemoteContainerConnectionState.REMOTE_CONTAINER_INSPECTED)?.result as { answer?: unknown } | undefined)?.answer;
      actor.stop();
      this.etl.clear(RemoteContainerConnectionMachine.NAME, requestId);
    }

    return this.active;
  }

  /** Runs the capability of the state, unless it says the state already holds. */
  private async runCapability(requestId: string, state: RemoteContainerConnectionStateValue): Promise<void> {
    await this.capabilities.execute(`${RemoteContainerConnectionMachine.CAPABILITY_ID_PREFIX}${state}`, {
      requestId,
      state,
      machine: RemoteContainerConnectionMachine.NAME,
      etl: this.etl,
      parameters: { container: this.request.container },
    });
  }
}
