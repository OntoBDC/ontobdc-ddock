import { StorageRoot } from '@/ontobdc/shared/adapter/storage-root';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { pickFolder } from './storage';

const CONTAINER_ID = 'ontobdc-container';

/** Defines the folder of the container the person opens. */
export class StorageContainerDefinedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.storage_container_defined',
    description: 'Define the folder of the container: the folder, writable, the person picks.',
  };

  /** Whether the folder of the container already is where the states keep it. */
  async isSatisfied(context: CapabilityContext): Promise<boolean> {
    return new StorageRoot(context).containerFolder() !== undefined;
  }

  /** Asks the person for the folder, with the folder picker, and records it. */
  async execute(context: CapabilityContext): Promise<void> {
    new StorageRoot(context).defineContainer(await pickFolder({ mode: 'readwrite', id: CONTAINER_ID }));
  }
}
