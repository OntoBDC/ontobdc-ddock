import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { StorageRoot } from '@/ontobdc/shared/adapter/storage-root';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { pickFolder } from './storage';

const STORAGE_ID = 'ontobdc-storage';

/** Defines the root of the workspace: the folder the containers are created in. */
export class StorageRootDefinedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.storage_root_defined',
    description: 'Define the root of the workspace: the folder, writable, the person picks.',
  };

  /** Whether Python already has the root, so the person need not be asked. */
  async isSatisfied(): Promise<boolean> {
    return StorageRoot.existsInPython();
  }

  /** Asks the person for the folder, with the folder picker, and records it as the root. */
  async execute(context: CapabilityContext): Promise<void> {
    const folder = await pickFolder({ mode: 'readwrite', id: STORAGE_ID });

    eventBus.publish('presentation.container.create.started', 'container', { name: context.parameters.name ?? '' });
    const root = new StorageRoot(context);
    root.define(folder);
    if (!(await root.isOk())) await root.initialize();
  }
}
