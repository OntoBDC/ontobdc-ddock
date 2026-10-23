import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { crateFilePaths, pathsToTree } from '@/ontobdc/shared/adapter/container-format';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const REFRESH_COMPLETED = 'presentation.container.refresh.completed';
type RefreshCompleted = AppEventMap[typeof REFRESH_COMPLETED];
const SOURCE = 'container_on_refresh_completed_files';
const METADATA_DIRECTORY = '.__ontobdc__';
const CRATE_FILE = 'ro-crate-metadata.json';

export class OnContainerRefreshCompletedFiles {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Reads the files of the container again once it was refreshed, for the explorer to show them.',
    arguments: [
      {
        listen: [REFRESH_COMPLETED],
        valued: false,
        description: 'The container was refreshed.',
        type: 'str',
      },
    ],
  };

  private readonly payload: RefreshCompleted | undefined;

  constructor(event: AppEvent) {
    this.payload = event.payload as RefreshCompleted | undefined;
  }

  /**
   * The refresh rewrites the RO-Crate of the container with the files it has now.
   * Reads it from the container folder and publishes `presentation.container.files.found`
   * with them, which replaces the tree of the FILES group. A container opened without
   * write access has no folder and keeps the files it showed.
   */
  async run(): Promise<void> {
    const folder = ContainerRepository.getInstance().get()?.folder;
    if (!folder) return;

    const crate = await ContainerFileRepository.of(folder).text(`${METADATA_DIRECTORY}/${CRATE_FILE}`);
    eventBus.publish('presentation.container.files.found', SOURCE, { nodes: pathsToTree(crateFilePaths(crate)) });
  }
}
