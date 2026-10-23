import type { UserLoginStateValue } from './state';

/** What the statechart's guards and actions ask of the machine. */
export interface UserLoginHandlerPort {
  /** Whether the machine may go from its current state to this one. */
  canTransitTo(state: UserLoginStateValue): boolean;
  /** Records that the machine entered the state. */
  performStateTransition(state: UserLoginStateValue): void;
}
