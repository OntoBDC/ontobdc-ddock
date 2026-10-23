import { StorageRoot } from '@/ontobdc/shared/adapter/storage-root';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Brings the container of the workspace in line with the files it holds. */
export class WorkspaceContainerHealthyCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.workspace_container_healthy',
    description: 'Run ontobdc container --refresh on the container of the workspace.',
  };

  /** Always false: the refresh runs every time. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    const name = new StorageRoot(context).containerName(context.parameters);
    if (!name) throw new Error('The new container request carries no name.');
    await new StorageRoot(context).refreshContainer(name);
  }
}
