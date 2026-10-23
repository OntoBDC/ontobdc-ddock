/** The states of the opening of a container of the workspace. Only states worth going on from. */
export const OpenContainerState = {
  UNDEFINED: 'undefined',
  STORAGE_CONTAINER_DEFINED: 'storage_container_defined',
  STORAGE_ROOT_DEFINED_FROM_CONTAINER: 'storage_root_defined_from_container',
  WORKSPACE_CONTAINER_CREATED: 'workspace_container_created',
  WORKSPACE_CONTAINER_HEALTHY: 'workspace_container_healthy',
} as const;

export type OpenContainerStateValue = (typeof OpenContainerState)[keyof typeof OpenContainerState];
