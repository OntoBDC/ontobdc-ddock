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
    const root = new StorageRoot(context);
    const folder = root.createdFolder();
    if (!folder) throw new Error('No state recorded the folder the container was made in.');
    await root.refreshContainer(folder);
  }
}
