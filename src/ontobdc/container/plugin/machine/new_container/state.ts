/** The states of the creation of a new container. Only states worth going on from. */
export const NewContainerState = {
  UNDEFINED: 'undefined',
  STORAGE_ROOT_DEFINED: 'storage_root_defined',
  WORKSPACE_CONTAINER_CREATED: 'workspace_container_created',
  WORKSPACE_CONTAINER_HEALTHY: 'workspace_container_healthy',
} as const;

export type NewContainerStateValue = (typeof NewContainerState)[keyof typeof NewContainerState];
