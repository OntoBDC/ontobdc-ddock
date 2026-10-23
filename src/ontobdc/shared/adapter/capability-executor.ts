import type {
  CapabilityClass, CapabilityContext, TransformationCapabilityClass,
} from '@/ontobdc/shared/domain/model/capability';

/** The capability modules of a machine, as `import.meta.glob` gives them: found by id, not run until needed. */
export type CapabilityImports = Record<string, () => Promise<Record<string, unknown>>>;

/** Finds the capability an id names among the modules of a machine, and runs it. */
export class CapabilityExecutor<Class extends CapabilityClass = CapabilityClass> {
  constructor(protected readonly imports: CapabilityImports) {}

  /** The class whose `METADATA.id` is `id`; fails when no module of the machine has it. */
  async find(id: string): Promise<Class> {
    for (const load of Object.values(this.imports)) {
      for (const exported of Object.values(await load())) {
        const metadata = (exported as { METADATA?: { id?: unknown } } | undefined)?.METADATA;
        if (typeof exported === 'function' && metadata?.id === id) return exported as unknown as Class;
      }
    }
    throw new Error(`Capability not found: ${id}`);
  }

  /** Runs the capability. Returns whether it ran: here it always does. */
  async execute(id: string, context: CapabilityContext): Promise<boolean> {
    const Capability = await this.find(id);
    await new Capability().execute(context);
    return true;
  }
}

/**
 * Runs the capability of a transformation only when the state it is for does not hold
 * yet: it asks `isSatisfied` first, and a capability that says yes is not executed.
 */
export class TransformationCapabilityExecutor extends CapabilityExecutor<TransformationCapabilityClass> {
  /** Returns whether the capability had to run: false when its state already held. */
  override async execute(id: string, context: CapabilityContext): Promise<boolean> {
    const Capability = await this.find(id);
    const capability = new Capability();
    if (await capability.isSatisfied(context)) return false;

    await capability.execute(context);
    return true;
  }
}
