/** Only the inspection fields used when opening a container. */
export type ContainerInspectionNode = {
  name: string;
  kind?: string;
  path?: string;
  children?: ContainerInspectionNode[];
};

export type ContainerInspection = {
  content: { tree?: ContainerInspectionNode; error?: string };
};

/** Public container state; directory handles stay private to the container adapter. */
export type ContainerOpened = {
  /** Writable folder containing .__ontobdc__/context.ttl; absent for read-only imports. */
  folder?: FileSystemDirectoryHandle;
  name: string;
  access: 'readwrite' | 'read';
  parts: number;
  inspect: ContainerInspection;
};
