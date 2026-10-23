import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { CONTAINER_REFRESH_COMMAND } from '@/ontobdc/shared/domain/model/container-command';

const UPLOAD_SELECTED = 'presentation.explorer.file.upload.selected';
type UploadSelected = AppEventMap[typeof UPLOAD_SELECTED];
const SOURCE = 'container_on_explorer_file_upload_selected';

export class OnExplorerFileUploadSelected {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Writes the files the person picked into the container, then refreshes the container.',
    arguments: [
      {
        listen: [UPLOAD_SELECTED],
        valued: true,
        parameter: 'path',
        description: 'Where the files go, in the container: a directory, or an empty text for the root of the container.',
        type: 'str',
      },
    ],
  };

  private readonly request: UploadSelected | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as UploadSelected | undefined;
  }

  /**
   * Writes each picked file into `path` of the container folder, creating the
   * directories of the path that are missing. A file that already exists there is
   * left as it is and reported as skipped; nothing is overwritten. When at least
   * one file was written, publishes `presentation.explorer.file.uploaded` and asks
   * for `ontobdc container --refresh`, so the container sees the new files. When the
   * container cannot be written or the path is not valid, publishes
   * `presentation.explorer.file.upload.failed` and refreshes nothing.
   */
  async run(): Promise<void> {
    const path = this.request?.path;
    const picked = this.request?.files ?? [];
    if (typeof path !== 'string') throw new Error('The selected files carry no path.');

    try {
      const folder = ContainerRepository.getInstance().get()?.folder;
      if (!folder) throw new Error('The container cannot be written: it is not open with write access.');
      const segments = path.split('/').filter((segment) => segment !== '');
      if (segments.some((segment) => segment === '.' || segment === '..')) throw new Error(`The path ${path} is not valid.`);

      // The directories of the path are made even when every file there is skipped.
      const repository = await ContainerFileRepository.of(folder).directory(segments.join('/'), { create: true });

      const files: string[] = [];
      const skipped: string[] = [];
      for (const file of picked) {
        if (await repository.write(file.name, file)) files.push(file.name);
        else skipped.push(file.name);
      }

      eventBus.publish('presentation.explorer.file.uploaded', SOURCE, { path, files, skipped });
      if (files.length > 0) {
        eventBus.publish('presentation.main.command.requested', SOURCE, { requestId: crypto.randomUUID(), command: CONTAINER_REFRESH_COMMAND });
      }
    } catch (error) {
      eventBus.publish('presentation.explorer.file.upload.failed', SOURCE, { path, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
