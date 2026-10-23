import { StorageRoot } from '@/ontobdc/shared/adapter/storage-root';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

const nameOf = (context: CapabilityContext): string => {
  const name = new StorageRoot(context).containerName(context.parameters);
  if (!name) throw new Error('The new container request carries no name.');
  return name;
};

/** Creates the container in the workspace, a folder called as the person named it. */
export class WorkspaceContainerCreatedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.workspace_container_created',
    description: 'Create the container in the workspace, unless its folder is already in the listing.',
  };

  /** Whether the listing of the workspace has the folder of the container. */
  async isSatisfied(context: CapabilityContext): Promise<boolean> {
    return new StorageRoot(context).hasContainer(nameOf(context));
  }

  async execute(context: CapabilityContext): Promise<void> {
    await new StorageRoot(context).createContainer(nameOf(context));
  }
}
