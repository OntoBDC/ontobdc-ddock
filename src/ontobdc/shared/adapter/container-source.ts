import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { runPythonCommand } from '@/ontobdc/shared/adapter/command';
import {
  crateFilePaths, InvalidCrateError,
  parseCliResponse, pathsToTree, unwrapCliText,
} from '@/ontobdc/shared/adapter/container-format';
import type { ContainerInspection, ContainerOpened } from '@/ontobdc/shared/domain/model/container';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { PythonMount } from '@/ontobdc/shared/domain/model/python-command';

const CRATE_PATH = '.__ontobdc__/ro-crate-metadata.json';
const INSPECT_ARGV: string[] = ['ontobdc', 'container', '--inspect', '--json'];
/** Where the runtime keeps what the browser mounts. */
const RUNTIME_STORAGE = '/storage';

/** The browser directory picker, as `window.showDirectoryPicker`. */
export type DirectoryPickerOptions = { mode: 'readwrite'; id: string; startIn?: FileSystemHandle };
export type DirectoryPicker = (options: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;

/** A directory seen as the container it holds, however it was picked. */
export type ContainerSource = {
  name: string;
  access: 'readwrite' | 'read';
  folder?: FileSystemDirectoryHandle;
  /**
   * Where the container is mounted in the runtime when its metadata says nowhere: the metadata of a
   * container does not state where it is (it can be moved or copied), so the place is the runtime's.
   */
  location: string;
  read(path: string): Promise<File | null>;
  mount(path: string): Promise<PythonMount>;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isDomError = (error: unknown, name: string): boolean => error instanceof DOMException && error.name === name;

/** The picked directory as a container source: writable, and mounted by its handle. */
export function directorySource(handle: FileSystemDirectoryHandle): ContainerSource {
  return sourceOf(handle, handle, `${RUNTIME_STORAGE}/${handle.name}`);
}

/** Keep the storage index mounted when inspecting a newly created container from its root. */
export function workspaceContainerSource(container: FileSystemDirectoryHandle, root: FileSystemDirectoryHandle): ContainerSource {
  return {
    ...sourceOf(container, container, `${RUNTIME_STORAGE}/${root.name}/${container.name}`),
    mount: async (path: string) => ({ path: parentDirectoryOf(path), handle: root }),
  };
}

function sourceOf(handle: FileSystemDirectoryHandle, folder: FileSystemDirectoryHandle, location: string): ContainerSource {
  return {
    name: handle.name,
    access: 'readwrite',
    folder,
    location,
    read: (path) => ContainerFileRepository.of(handle).file(path),
    mount: async (path) => ({ path, handle }),
  };
}

/**
 * Reads the container the source points at. Its RO-Crate lists its parts; the source is
 * mounted where the runtime keeps what the browser mounts, so the container appears at the same place
 * the steps that opened the workspace put it. A workspace source
 * also mounts the enclosing storage root and its index.
 *
 * Publishes `inspect.started` when the inspection begins, `files.found` and
 * `local.opened` when it worked, and `open.failed` when it did not.
 */
export async function openContainer(source: ContainerSource, sourceId: string): Promise<void> {
  const failed = (reason: AppEventMap['presentation.container.open.failed']['reason'], name: string | null, error?: unknown): void => {
    eventBus.publish('presentation.container.open.failed', sourceId, {
      reason, name, ...(error === undefined ? {} : { message: messageOf(error) }),
    });
  };

  let paths: string[];
  try {
    const crate = await source.read(CRATE_PATH);
    if (!crate) return failed('crate-not-found', source.name);
    paths = crateFilePaths(await crate.text());
  } catch (error) {
    return failed(error instanceof InvalidCrateError ? 'crate-invalid' : isDomError(error, 'NotAllowedError') ? 'permission-denied' : 'read-error', source.name, error);
  }
  // Where the container is mounted is the runtime's to say: its metadata does not state where it is (the container can be
  // moved or copied), and the locations an older version wrote in it are the ones of other machines, and of its datasets.
  const location = source.location;

  eventBus.publish('presentation.container.inspect.started', sourceId, { name: source.name });
  try {
    const mount = await source.mount(location);
    // Implicit inspection resolves from cwd upwards, never into child folders.
    // A source mounted at the storage root must select its container explicitly.
    const argv = (mount.cwd ?? mount.path) === location
      ? INSPECT_ARGV
      : [...INSPECT_ARGV, '--container', location];
    const result = await runPythonCommand(sourceId, argv, mount);
    const inspect = parseCliResponse<ContainerInspection['content']>(result.stdout);
    if (result.code !== 0 || !inspect?.content?.tree) {
      throw new Error(inspect?.content?.error ? unwrapCliText(inspect.content.error) : result.stderr.trim() || `Inspection failed (exit ${result.code}).`);
    }
    const container: ContainerOpened = {
      name: source.name,
      access: source.access,
      parts: paths.length,
      inspect,
      folder: source.folder ?? mount.handle,
    };
    eventBus.publish('presentation.container.files.found', sourceId, { nodes: pathsToTree(paths) });
    eventBus.publish('presentation.container.local.opened', sourceId, container);
  } catch (error) {
    failed('inspect-failed', source.name, error);
  }
}

function parentDirectoryOf(path: string): string {
  const separator = path.lastIndexOf('/');
  if (separator <= 0) throw new Error('The container location must be an absolute path below a root directory.');
  return path.slice(0, separator);
}
