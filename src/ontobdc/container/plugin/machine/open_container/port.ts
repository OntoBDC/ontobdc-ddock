import type { OpenContainerStateValue } from './state';

/** What the statechart's guards and actions ask of the machine. */
export interface OpenContainerHandlerPort {
  /** Whether the machine may go from its current state to this one. */
  canTransitTo(state: OpenContainerStateValue): boolean;
  /** Records that the machine entered the state. */
  performStateTransition(state: OpenContainerStateValue): void;
}
