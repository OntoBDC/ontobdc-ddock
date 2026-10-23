import type { EtlPort } from './etl';

/** What a capability of a connection FSM works on. */
export type CapabilityContext = {
  /** Identifies this execution in the ETL. */
  requestId: string;
  /** The name of the state whose capability is running. */
  state: string;
  /** The machine the state belongs to, for the capabilities that several machines share. */
  machine?: string;
  etl: EtlPort;
  /** The parameters the execution was asked with. */
  parameters: Readonly<Record<string, string | undefined>>;
};

export type CapabilityMetadata = {
  id: string;
  description: string;
};

/**
 * Does the work of one state. A capability that cannot do it throws: a state
 * is only reached when it makes sense to go on.
 */
export type CapabilityClass = {
  METADATA: CapabilityMetadata;
  new (): { execute(context: CapabilityContext): Promise<void> };
};

/**
 * The capability of a transformation: it says whether the state it is for already
 * holds, and does the work only when it does not. `isSatisfied` is not optional.
 */
export type TransformationCapabilityClass = {
  METADATA: CapabilityMetadata;
  new (): {
    /** Whether the state already holds, so there is nothing to do. */
    isSatisfied(context: CapabilityContext): Promise<boolean>;
    execute(context: CapabilityContext): Promise<void>;
  };
};
