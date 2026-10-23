import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/**
 * Reads the activated file from the opened container folder and extracts its
 * metadata so the next state can decide how to open it.
 */
export class FileMetadataExtractedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.file_metadata_extracted',
    description: 'Read the activated file and extract its metadata.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const item = context.parameters.item;
    if (!item) throw new Error('No file was activated.');

    const container = ContainerRepository.getInstance().get();
    if (!container?.folder) throw new Error('No container is open.');

    const file = await ContainerFileRepository.of(container.folder).file(item);
    const metadata = {
      path: item,
      name: file.name,
      extension: file.name.split('.').pop()?.toLowerCase() ?? '',
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    };

    context.etl.write('explorer_file_open', context.requestId, context.state, {
      phase: 'done',
      entity: { path: item },
      result: metadata,
    });
  }
}
