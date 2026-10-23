import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { translate } from '@/ontobdc/shared/plugin/i18n';
import { createActor, createMachine } from 'xstate';
import { TransformationCapabilityExecutor } from '@/ontobdc/shared/adapter/capability-executor';
import { Etl } from '@/ontobdc/shared/adapter/etl';
import type { NamedCall } from '@/ontobdc/shared/adapter/statechart-converter';
import type { UserLoginHandlerPort } from './port';
import { UserLoginState, type UserLoginStateValue } from './state';
import { UserLoginStatechart } from './statechart';

/** Discover the capabilities of the module without executing them yet. */
const capabilityImports = import.meta.glob<Record<string, unknown>>('../../capability/transformation/*.ts');

const PORT_NAME = 'UserLoginStatePort';

/** `UserLoginStatePort.STORAGE_ROOT_DEFINED` into the state it names. */
const stateOf = (constant: string): UserLoginStateValue => {
  const [port, name] = constant.split('.');
  const value = (UserLoginState as Record<string, UserLoginStateValue>)[name];
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
export class UserLoginMachine implements UserLoginHandlerPort {
  static readonly NAME = 'user_login';
  static readonly CAPABILITY_ID_PREFIX = 'org.ontobdc.user.plugin.capability.transformation.target.';
  static readonly FINAL_STATE = UserLoginState.ACCESS_TOKEN_REMEMBERED;

  private active: UserLoginStateValue = UserLoginState.UNDEFINED;
  private readonly capabilities = new TransformationCapabilityExecutor(capabilityImports);

  constructor(private readonly etl: Etl = new Etl()) {}

  canTransitTo(state: UserLoginStateValue): boolean {
    const sequence = UserLoginStatechart.sequence();
    return sequence[sequence.indexOf(this.active) + 1] === state;
  }

  performStateTransition(state: UserLoginStateValue): void {
    this.active = state;
  }

  /** Walks the statechart to its final state and returns it. */
  async execute(): Promise<UserLoginStateValue> {
    const requestId = crypto.randomUUID();
    // The tab opens before the states: it shows a skeleton until one of them says the login is ready.
    eventBus.publish('presentation.main.panel.open.requested', 'user_login', {
      container: 'surface',
      id: 'login',
      component: 'login',
      title: translate('login.tab'),
    });
    const config = UserLoginStatechart.config();
    const sequence = UserLoginStatechart.sequence();

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

        await this.runCapability(requestId, next as UserLoginStateValue);
        actor.send({ type: 'STEP' });
        if (String(actor.getSnapshot().value) === current) {
          throw new Error(`The statechart stayed in ${current} after the capability of ${next} ran.`);
        }
      }
    } finally {
      actor.stop();
      this.etl.clear(UserLoginMachine.NAME, requestId);
    }

    return this.active;
  }

  /** Runs the capability of the state, unless it says the state already holds. */
  private async runCapability(requestId: string, state: UserLoginStateValue): Promise<void> {
    await this.capabilities.execute(`${UserLoginMachine.CAPABILITY_ID_PREFIX}${state}`, {
      requestId,
      state,
      machine: UserLoginMachine.NAME,
      etl: this.etl,
      parameters: {},
    });
  }
}
