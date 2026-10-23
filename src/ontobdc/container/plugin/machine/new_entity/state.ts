/** The states of the start of a new entity of any type. Only states worth going on from. */
export const NewEntityState = {
  UNDEFINED: 'undefined',
  ENTITY_TYPE_RESOLVED: 'entity_type_resolved',
  ENTITY_DATASET_READY: 'entity_dataset_ready',
  ENTITY_NEW_FACADE_FOUND: 'entity_new_facade_found',
  ENTITY_NEW_TAB_OPENED: 'entity_new_tab_opened',
} as const;

export type NewEntityStateValue = (typeof NewEntityState)[keyof typeof NewEntityState];
