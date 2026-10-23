import type { NewEntityStateValue } from './state';

/** What the statechart's guards and actions ask of the machine. */
export interface NewEntityHandlerPort {
  /** Whether the machine may go from its current state to this one. */
  canTransitTo(state: NewEntityStateValue): boolean;
  /** Records that the machine entered the state. */
  performStateTransition(state: NewEntityStateValue): void;
}

/**
 * What a new entity is asked with: the type of the entity, or the group (the dataset's path in the
 * container) that holds entities of it, and the fields the form starts with, by name.
 */
export type NewEntityRequest = {
  entityType?: string;
  group?: string;
  values?: Record<string, string>;
};
