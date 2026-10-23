import type { NewContainerStateValue } from './state';

/** What the statechart's guards and actions ask of the machine. */
export interface NewContainerHandlerPort {
  /** Whether the machine may go from its current state to this one. */
  canTransitTo(state: NewContainerStateValue): boolean;
  /** Records that the machine entered the state. */
  performStateTransition(state: NewContainerStateValue): void;
}

/** What a new container is asked with. */
export type NewContainerRequest = {
  /** The single directory the container is created in. */
  name: string;
};
