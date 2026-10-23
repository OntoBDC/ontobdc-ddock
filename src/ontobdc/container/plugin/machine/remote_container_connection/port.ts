import type { RemoteContainerConnectionStateValue } from './state';

/** What the statechart's guards and actions ask of the machine. */
export interface RemoteContainerConnectionHandlerPort {
  /** Whether the machine may go from its current state to this one. */
  canTransitTo(state: RemoteContainerConnectionStateValue): boolean;
  /** Records that the machine entered the state. */
  performStateTransition(state: RemoteContainerConnectionStateValue): void;
}

/** What a connection is asked with. */
export type RemoteContainerConnectionRequest = {
  /** The URI of the container, as the server lists it. */
  container: string;
};
