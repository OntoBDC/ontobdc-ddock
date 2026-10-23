/** The states of the connection to a container of the server. Only states worth going on from. */
export const RemoteContainerConnectionState = {
  UNDEFINED: 'undefined',
  REMOTE_CONTAINER_INSPECTED: 'remote_container_inspected',
} as const;

export type RemoteContainerConnectionStateValue = (typeof RemoteContainerConnectionState)[keyof typeof RemoteContainerConnectionState];
