import { StorageRoot } from '@/ontobdc/shared/adapter/storage-root';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/**
 * Defines the root of the workspace from the container: the directory above the folder of the
 * container is the working directory, and `ontobdc init` runs in it unless it has a root.
 */
export class StorageRootDefinedFromContainerCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.storage_root_defined_from_container',
    description: 'Define the directory above the folder of the container as the root of the workspace.',
  };

  /** Whether the root the states work on already is defined. */
  async isSatisfied(context: CapabilityContext): Promise<boolean> {
    return new StorageRoot(context).folder() !== undefined;
  }

  async execute(context: CapabilityContext): Promise<void> {
    const root = new StorageRoot(context);
    const container = root.containerFolder();
    if (!container) throw new Error('There is no folder of the container to find the root from.');

    root.defineAbove(container);
    if (!(await root.isOk())) await root.initialize();
  }
}
