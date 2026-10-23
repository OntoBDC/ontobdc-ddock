import { createActor, createMachine } from 'xstate';
import { TransformationCapabilityExecutor } from '@/ontobdc/shared/adapter/capability-executor';
import { Etl } from '@/ontobdc/shared/adapter/etl';
import type { NamedCall } from '@/ontobdc/shared/adapter/statechart-converter';
import type { NewEntityHandlerPort, NewEntityRequest } from './port';
import { NewEntityState, type NewEntityStateValue } from './state';
import { NewEntityStatechart } from './statechart';

/** Discover the capabilities of the module without executing them yet. */
const capabilityImports = import.meta.glob<Record<string, unknown>>('../../capability/transformation/*.ts');

const PORT_NAME = 'NewEntityStatePort';

/** `NewEntityStatePort.ENTITY_TYPE_RESOLVED` into the state it names. */
const stateOf = (constant: string): NewEntityStateValue => {
  const [port, name] = constant.split('.');
  const value = (NewEntityState as Record<string, NewEntityStateValue>)[name];
  if (port !== PORT_NAME || value === undefined) throw new Error(`Unknown state constant: ${constant}`);
  return value;
};

/**
 * Drives the statechart of the start of a new entity, of any type.
 *
 * The statechart decides which state comes next, and its guard asks whether
 * the state is the one that follows the current one. The capability of a state
 * is not listed anywhere: its id is the prefix plus the name of the state, and
 * the driver runs it before it lets the machine enter that state. A capability that
 * fails throws, and so does the machine: a state is only reached when it makes
 * sense to go on.
 */
export class NewEntityMachine implements NewEntityHandlerPort {
  static readonly NAME = 'new_entity';
  static readonly CAPABILITY_ID_PREFIX = 'org.ontobdc.container.plugin.capability.transformation.target.';
  static readonly FINAL_STATE = NewEntityState.ENTITY_NEW_TAB_OPENED;

  private active: NewEntityStateValue = NewEntityState.UNDEFINED;
  private readonly capabilities = new TransformationCapabilityExecutor(capabilityImports);

  constructor(
    private readonly request: NewEntityRequest,
    private readonly etl: Etl = new Etl(),
  ) {}

  canTransitTo(state: NewEntityStateValue): boolean {
    const sequence = NewEntityStatechart.sequence();
    return sequence[sequence.indexOf(this.active) + 1] === state;
  }

  performStateTransition(state: NewEntityStateValue): void {
    this.active = state;
  }

  /** Walks the statechart to its final state and returns it. */
  async execute(): Promise<NewEntityStateValue> {
    const requestId = crypto.randomUUID();
    const config = NewEntityStatechart.config();
    const sequence = NewEntityStatechart.sequence();

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

        await this.runCapability(requestId, next as NewEntityStateValue);
        actor.send({ type: 'STEP' });
        if (String(actor.getSnapshot().value) === current) {
          throw new Error(`The statechart stayed in ${current} after the capability of ${next} ran.`);
        }
      }
    } finally {
      actor.stop();
      this.etl.clear(NewEntityMachine.NAME, requestId);
    }

    return this.active;
  }

  /** Runs the capability of the state, unless it says the state already holds. */
  private async runCapability(requestId: string, state: NewEntityStateValue): Promise<void> {
    await this.capabilities.execute(`${NewEntityMachine.CAPABILITY_ID_PREFIX}${state}`, {
      requestId,
      state,
      machine: NewEntityMachine.NAME,
      etl: this.etl,
      parameters: {
        entityType: this.request.entityType,
        group: this.request.group,
        values: JSON.stringify(this.request.values ?? {}),
      },
    });
  }
}
