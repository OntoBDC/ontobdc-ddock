import { isEntryName, segmentsOf } from '@/ontobdc/shared/adapter/container-entries';

type Entry = { parent: FileSystemDirectoryHandle; name: string; kind: 'file' | 'directory' };

const isNotFound = (error: unknown): boolean => error instanceof DOMException && error.name === 'NotFoundError';

/**
 * The files of a folder the person gave access to, by their path in it (`a/b/c.txt`). It is the only
 * way the application reads, writes, renames or deletes what the folder holds (the runtime's own copy
 * of the folder, `python-mount`, is the other one): nothing else walks the directory handles, so what
 * a path means, and what is not valid, is decided in one place.
 */
export class ContainerFileRepository {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  static of(root: FileSystemDirectoryHandle): ContainerFileRepository {
    return new ContainerFileRepository(root);
  }

  /** The folder itself, for what has to hand it over (the runtime mounts it). */
  get handle(): FileSystemDirectoryHandle {
    return this.root;
  }

  /** The repository of a directory inside the folder; it must exist, unless `create` says to make it. */
  async directory(path: string, options: { create?: boolean } = {}): Promise<ContainerFileRepository> {
    let directory = this.root;
    for (const segment of path === '' ? [] : segmentsOf(path)) {
      directory = options.create ? await directory.getDirectoryHandle(segment, { create: true }) : await directory.getDirectoryHandle(segment);
    }
    return new ContainerFileRepository(directory);
  }

  /** The file at the path, as the browser reads it. */
  async file(path: string): Promise<File> {
    const segments = path.split('/').filter(Boolean);
    const name = segments.at(-1);
    if (!name) throw new Error(`Invalid file path: ${path}`);
    const parent = await this.parentOf(segments);
    return await (await parent.getFileHandle(name)).getFile();
  }

  /** The text of the file at the path. */
  async text(path: string): Promise<string> {
    return (await this.file(path)).text();
  }

  /** Whether there is a file at the path. */
  async exists(path: string): Promise<boolean> {
    return this.file(path).then(() => true, (error: unknown) => {
      if (isNotFound(error)) return false;
      throw error;
    });
  }

  /**
   * Writes the data to the path, making the directories it needs. A file that is there is left
   * as it is, unless `overwrite`; says whether it wrote.
   */
  async write(path: string, data: Blob | string, options: { overwrite?: boolean } = {}): Promise<boolean> {
    const segments = segmentsOf(path);
    const name = segments[segments.length - 1];
    let parent = this.root;
    for (const segment of segments.slice(0, -1)) parent = await parent.getDirectoryHandle(segment, { create: true });
    if (!options.overwrite && (await this.has(parent, name))) return false;
    const writable = await (await parent.getFileHandle(name, { create: true })).createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
    return true;
  }

  /** Whether `name` is taken, by a file or a directory, in the directory that holds `path`. */
  async nameTakenNextTo(path: string, name: string): Promise<boolean> {
    const { parent } = await this.entryAt(path);
    const taken = (open: () => Promise<unknown>): Promise<boolean> => open().then(() => true, () => false);
    return (await taken(() => parent.getFileHandle(name))) || (await taken(() => parent.getDirectoryHandle(name)));
  }

  /** Gives the entry at `path` another name, in the same directory. Moves it when the browser can, else copies it and removes the old one. */
  async rename(path: string, name: string): Promise<void> {
    if (!isEntryName(name)) throw new Error(`${name} is not a valid name.`);
    const { parent, name: current, kind } = await this.entryAt(path);

    if (kind === 'file') {
      const handle = await parent.getFileHandle(current);
      const movable = handle as unknown as { move?: (name: string) => Promise<void> };
      if (typeof movable.move === 'function') {
        await movable.move(name);
        return;
      }
      await this.copyFile(handle, parent, name);
      await parent.removeEntry(current);
      return;
    }

    const directory = await parent.getDirectoryHandle(current);
    const movable = directory as unknown as { move?: (name: string) => Promise<void> };
    if (typeof movable.move === 'function') {
      await movable.move(name);
      return;
    }
    await this.copyDirectory(directory, await parent.getDirectoryHandle(name, { create: true }));
    await parent.removeEntry(current, { recursive: true });
  }

  /** Removes the entry at `path`; a directory goes with all it holds. */
  async delete(path: string): Promise<void> {
    const { parent, name, kind } = await this.entryAt(path);
    await parent.removeEntry(name, { recursive: kind === 'directory' });
  }

  private async parentOf(segments: string[]): Promise<FileSystemDirectoryHandle> {
    let directory = this.root;
    for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
    return directory;
  }

  private async has(parent: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    return parent.getFileHandle(name).then(() => true, (error: unknown) => {
      if (isNotFound(error)) return false;
      throw error;
    });
  }

  private async entryAt(path: string): Promise<Entry> {
    const segments = segmentsOf(path);
    const parent = await this.parentOf(segments);
    const name = segments[segments.length - 1];
    const kind = await parent.getFileHandle(name).then(() => 'file' as const, () => 'directory' as const);
    if (kind === 'directory') await parent.getDirectoryHandle(name);
    return { parent, name, kind };
  }

  private async copyFile(from: FileSystemFileHandle, to: FileSystemDirectoryHandle, name: string): Promise<void> {
    const writable = await (await to.getFileHandle(name, { create: true })).createWritable();
    await writable.write(await from.getFile());
    await writable.close();
  }

  private async copyDirectory(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle): Promise<void> {
    for await (const handle of (from as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      if (handle.kind === 'directory') {
        await this.copyDirectory(handle as FileSystemDirectoryHandle, await to.getDirectoryHandle(handle.name, { create: true }));
      } else {
        await this.copyFile(handle as FileSystemFileHandle, to, handle.name);
      }
    }
  }
}
