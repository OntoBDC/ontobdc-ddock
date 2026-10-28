import { parse } from 'yaml';

/** A guard or action named by the YAML: `object.method(key = Port.CONSTANT)`. */
export type NamedCall = {
  type: string;
  params: Record<string, string>;
  negated: boolean;
};

type Transition = { target: string; guard?: NamedCall; actions?: NamedCall[] };
type StateNode = {
  type?: 'final';
  meta: { label: Record<string, string>; description: Record<string, string> };
  on?: { STEP: Transition[] };
};

export type StatechartConfig = {
  id: string;
  initial: string;
  states: Record<string, StateNode>;
};

const CALL = /^(not\s+)?([A-Za-z_]\w*\.[A-Za-z_]\w*)\(\s*([^)]*?)\s*\)$/;
const PARAMETER = /^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*\.[A-Za-z_]\w*)$/;

const fail = (message: string): never => {
  throw new Error(`Statechart: ${message}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `not handler.method(key = Port.CONSTANT)` into a named call; anything else fails. */
export function parseCall(expression: string): NamedCall {
  const match = CALL.exec(expression.trim());
  if (!match) return fail(`unsupported expression: ${expression}`);

  const params: Record<string, string> = {};
  const raw = match[3].trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const parameter = PARAMETER.exec(part.trim());
      if (!parameter) return fail(`unsupported parameter "${part.trim()}" in: ${expression}`);
      params[parameter[1]] = parameter[2];
    }
  }
  return { type: match[2], params, negated: Boolean(match[1]) };
}

const text = (value: unknown, where: string): Record<string, string> => {
  if (value === undefined) return {};
  if (!isRecord(value)) return fail(`${where} must be a mapping of languages to text.`);
  return Object.fromEntries(Object.entries(value).map(([language, content]) => [language, String(content)]));
};

const KNOWN_STATE_KEYS = new Set(['name', 'label', 'description', 'transitions', 'type']);
const KNOWN_TRANSITION_KEYS = new Set(['target', 'guard', 'action', 'contract']);

/**
 * Turns an OntoBDC statechart (the sismic YAML subset it uses) into an XState
 * configuration. Every transition is a `STEP`; guards and actions stay named
 * calls, for the machine to give an implementation.
 */
export function convertStatechart(source: string): StatechartConfig {
  const document: unknown = parse(source);
  const statechart = isRecord(document) ? document.statechart : undefined;
  const root = isRecord(statechart) ? statechart['root state'] : undefined;
  if (!isRecord(statechart) || !isRecord(root)) return fail('no "statechart" with a "root state".');
  if (typeof root.name !== 'string' || typeof root.initial !== 'string' || !Array.isArray(root.states)) {
    return fail('the root state needs name, initial and states.');
  }

  const states: Record<string, StateNode> = {};
  for (const entry of root.states as unknown[]) {
    if (!isRecord(entry) || typeof entry.name !== 'string') return fail('a state has no name.');
    const name = entry.name;
    for (const key of Object.keys(entry)) if (!KNOWN_STATE_KEYS.has(key)) fail(`state ${name}: unsupported key "${key}".`);
    if (entry.type !== undefined && entry.type !== 'final') fail(`state ${name}: unsupported type "${String(entry.type)}".`);

    const node: StateNode = {
      meta: { label: text(entry.label, `${name}.label`), description: text(entry.description, `${name}.description`) },
    };
    if (entry.type === 'final') node.type = 'final';

    if (entry.transitions !== undefined) {
      if (!Array.isArray(entry.transitions)) return fail(`state ${name}: transitions must be a list.`);
      node.on = {
        STEP: (entry.transitions as unknown[]).map((transition): Transition => {
          if (!isRecord(transition) || typeof transition.target !== 'string') return fail(`state ${name}: a transition has no target.`);
          for (const key of Object.keys(transition)) if (!KNOWN_TRANSITION_KEYS.has(key)) fail(`state ${name}: unsupported transition key "${key}".`);
          return {
            target: transition.target,
            ...(typeof transition.guard === 'string' ? { guard: parseCall(transition.guard) } : {}),
            ...(typeof transition.action === 'string' ? { actions: [parseCall(transition.action)] } : {}),
          };
        }),
      };
    }
    states[name] = node;
  }

  if (!(root.initial in states)) return fail(`initial state "${root.initial}" is not defined.`);
  for (const [name, node] of Object.entries(states)) {
    for (const transition of node.on?.STEP ?? []) {
      if (!(transition.target in states)) fail(`state ${name}: target "${transition.target}" is not defined.`);
    }
  }

  return { id: root.name, initial: root.initial, states };
}

/** The states in the order the first transitions lead through them. */
export function stateSequence(config: StatechartConfig): string[] {
  const sequence: string[] = [];
  let current: string | undefined = config.initial;
  while (current !== undefined && !sequence.includes(current)) {
    sequence.push(current);
    current = config.states[current].on?.STEP[0]?.target;
  }
  return sequence;
}

/** The name of a chain-of-responsibility statechart; its regions are built by the worker from the capabilities. */
export function chainName(source: string): string {
  const document: unknown = parse(source);
  const statechart = isRecord(document) ? document.statechart : undefined;
  if (!isRecord(statechart) || typeof statechart.name !== 'string') return fail('no "statechart" with a name.');
  return statechart.name;
}
