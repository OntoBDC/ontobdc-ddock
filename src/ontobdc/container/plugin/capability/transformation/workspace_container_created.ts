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
    description: 'Create the container in the workspace, and record the folder the command made it in.',
  };

  /**
   * Always false: the command makes the container or finds the one that is there, and says the folder it is in,
   * which is not always the name the person typed, so the listing cannot tell whether it is done.
   */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    await new StorageRoot(context).createContainer(nameOf(context));
  }
}
