import { planPull, planSync, type FolderEntry, type FolderListing } from './python-sync';

/** What the session needs of the file system of the runtime (Emscripten's `FS`, which is what the worker gives). */
export interface RuntimeFs {
  readdir(path: string): string[];
  stat(path: string): { mode: number; mtime: Date | number; size: number };
  isDir(mode: number): boolean;
  mkdirTree(path: string): void;
  readFile(path: string): Uint8Array;
  writeFile(path: string, data: Uint8Array): void;
  unlink(path: string): void;
  rmdir(path: string): void;
  utime(path: string, atime: number, mtime: number): void;
}

/** How many files of the folder on disk are read at the same time. */
const CONCURRENCY = 16;

const dirname = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const underneath = (path: string, top: string): boolean => top === '' || path === top || path.startsWith(`${top}/`);
const ancestorsOf = (path: string): string[] => {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
};

async function directoryAt(top: FileSystemDirectoryHandle, segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = top;
  for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create });
  return dir;
}

/** Runs the tasks `CONCURRENCY` at a time. */
async function inBatches<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += CONCURRENCY) {
    await Promise.all(items.slice(start, start + CONCURRENCY).map(task));
  }
}

/**
 * A folder on disk kept in the file system of the runtime for as long as the session lasts, instead of
 * being copied in and thrown away for every command.
 *
 * The runtime works on its copy. What a command changed is carried back to the folder on disk after it
 * (`writeBack`, only what the command did). What changed on disk by other means is carried into the copy
 * (`pull`, only what differs from what was last seen), when the app says it may have changed (`invalidate`):
 * the files the app wrote itself, or everything, when the person comes back to the page. `local` and
 * `remote` are what the copy and the folder looked like when they were last known to agree.
 */
export class MountSession {
  /** The copy as it was when the session last carried something either way. */
  private local: FolderListing = new Map();
  /** The folder on disk as it was when the session last looked. */
  private remote: FolderListing = new Map();
  private everything = true;
  private readonly hinted = new Set<string>();
  private lastFullPull = 0;

  constructor(
    readonly path: string,
    readonly handle: FileSystemDirectoryHandle,
    private readonly fs: RuntimeFs,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether this session is for that folder at that place. */
  async isFor(path: string, handle: FileSystemDirectoryHandle): Promise<boolean> {
    if (path !== this.path) return false;
    try {
      return await this.handle.isSameEntry(handle);
    } catch {
      return false;
    }
  }

  /** The folder on disk may have changed: everywhere, or at these paths (relative to the folder). */
  invalidate(paths?: string[]): void {
    if (!paths || paths.length === 0) this.everything = true;
    else paths.forEach((path) => this.hinted.add(path.split('/').filter(Boolean).join('/')));
  }

  /**
   * Brings the copy up to date with the folder on disk before a command runs, when something said it may
   * have changed (always the first time). `force` asks for a full look whatever was said.
   */
  async refresh(force = false): Promise<void> {
    if (this.everything || force) {
      // A look at everything was done a moment ago: the next one would find nothing new.
      const justLooked = !force && this.lastFullPull > 0 && this.now() - this.lastFullPull < 1000;
      if (!justLooked) {
        await this.pull('');
        this.lastFullPull = this.now();
      }
      this.everything = false;
      this.hinted.clear();
      return;
    }
    const paths = [...this.hinted];
    this.hinted.clear();
    for (const path of paths) await this.pull(path);
  }

  /** Carries into the copy what differs on disk, at `sub` and below it (the whole folder when empty). */
  async pull(sub: string): Promise<void> {
    const found = await this.look(sub);
    const seen: FolderListing = new Map([...this.remote].filter(([path]) => underneath(path, sub)));
    const plan = planPull(seen, found);

    for (const path of plan.remove) {
      const stat = this.stat(path);
      if (!stat) continue;
      try {
        if (this.fs.isDir(stat.mode)) this.fs.rmdir(`${this.path}/${path}`); else this.fs.unlink(`${this.path}/${path}`);
      } catch {
        // A directory that holds something the runtime made and did not carry to disk yet stays.
      }
    }
    for (const path of plan.createDirs) this.fs.mkdirTree(`${this.path}/${path}`);
    await inBatches(plan.load, async (path) => {
      const file = await (await this.fileHandle(path)).getFile();
      const data = new Uint8Array(await file.arrayBuffer());
      this.fs.mkdirTree(`${this.path}/${dirname(path)}`);
      this.fs.writeFile(`${this.path}/${path}`, data);
      this.fs.utime(`${this.path}/${path}`, file.lastModified, file.lastModified);
    });

    for (const path of plan.remove) { this.remote.delete(path); this.local.delete(path); }
    for (const [path, entry] of found) this.remote.set(path, entry);
    for (const path of [...plan.createDirs, ...plan.load]) {
      for (const ancestor of ancestorsOf(path)) if (!this.remote.has(ancestor)) this.remote.set(ancestor, { kind: 'dir', mtime: 0, size: 0 });
      const stat = this.stat(path);
      if (stat) this.local.set(path, this.entryOf(stat));
      for (const ancestor of ancestorsOf(path)) {
        const parent = this.stat(ancestor);
        if (parent && !this.local.has(ancestor)) this.local.set(ancestor, this.entryOf(parent));
      }
    }
  }

  /**
   * Carries back to the folder on disk what the command did to the copy, and only that. What appeared on
   * disk while it ran is in neither listing, so it stays as it is.
   */
  async writeBack(): Promise<void> {
    const after = listFolder(this.fs, this.path);
    const plan = planSync(this.local, after);

    for (const path of plan.remove) {
      const segments = path.split('/');
      try {
        const parent = await directoryAt(this.handle, segments.slice(0, -1), false);
        // Not recursive: the entries the command removed inside it come first in the plan.
        await parent.removeEntry(segments[segments.length - 1]);
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        // Already gone from disk, or a directory that got new entries there while the command ran: it stays as it is.
        if (error.name === 'NotFoundError' || error.name === 'InvalidModificationError') continue;
        throw error;
      }
      this.remote.delete(path);
    }
    for (const path of plan.createDirs) {
      await directoryAt(this.handle, path.split('/'), true);
      this.remote.set(path, { kind: 'dir', mtime: 0, size: 0 });
    }
    for (const path of plan.writeFiles) {
      const segments = path.split('/');
      const parent = await directoryAt(this.handle, segments.slice(0, -1), true);
      const handle = await parent.getFileHandle(segments[segments.length - 1], { create: true });
      const writable = await handle.createWritable();
      await writable.write(this.fs.readFile(`${this.path}/${path}`) as Uint8Array<ArrayBuffer>);
      await writable.close();
      const file = await handle.getFile();
      this.remote.set(path, { kind: 'file', mtime: file.lastModified, size: file.size });
    }
    this.local = after;
  }

  /** What `sub` is on disk, and what is under it when it is a directory; nothing when it is not there. */
  private async look(sub: string): Promise<FolderListing> {
    const found: FolderListing = new Map();
    if (sub === '') {
      await this.walk(this.handle, '', found);
      return found;
    }
    const segments = sub.split('/');
    let parent: FileSystemDirectoryHandle;
    try {
      parent = await directoryAt(this.handle, segments.slice(0, -1), false);
    } catch {
      return found;
    }
    const name = segments[segments.length - 1];
    try {
      const file = await (await parent.getFileHandle(name)).getFile();
      found.set(sub, { kind: 'file', mtime: file.lastModified, size: file.size });
      return found;
    } catch { /* not a file */ }
    try {
      const directory = await parent.getDirectoryHandle(name);
      found.set(sub, { kind: 'dir', mtime: 0, size: 0 });
      await this.walk(directory, sub, found);
    } catch { /* not there */ }
    return found;
  }

  private async walk(directory: FileSystemDirectoryHandle, prefix: string, into: FolderListing): Promise<void> {
    const files: Array<{ path: string; handle: FileSystemFileHandle }> = [];
    const directories: Array<{ path: string; handle: FileSystemDirectoryHandle }> = [];
    for await (const handle of (directory as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      const path = prefix ? `${prefix}/${handle.name}` : handle.name;
      if (handle.kind === 'directory') {
        into.set(path, { kind: 'dir', mtime: 0, size: 0 });
        directories.push({ path, handle: handle as FileSystemDirectoryHandle });
      } else {
        files.push({ path, handle: handle as FileSystemFileHandle });
      }
    }
    await inBatches(files, async ({ path, handle }) => {
      const file = await handle.getFile();
      into.set(path, { kind: 'file', mtime: file.lastModified, size: file.size });
    });
    for (const { path, handle } of directories) await this.walk(handle, path, into);
  }

  private async fileHandle(path: string): Promise<FileSystemFileHandle> {
    const segments = path.split('/');
    const parent = await directoryAt(this.handle, segments.slice(0, -1), false);
    return parent.getFileHandle(segments[segments.length - 1]);
  }

  private stat(path: string): { mode: number; mtime: Date | number; size: number } | null {
    try {
      return this.fs.stat(`${this.path}/${path}`);
    } catch {
      return null;
    }
  }

  private entryOf(stat: { mode: number; mtime: Date | number; size: number }): FolderEntry {
    const isDir = this.fs.isDir(stat.mode);
    return { kind: isDir ? 'dir' : 'file', mtime: new Date(stat.mtime).getTime(), size: isDir ? 0 : stat.size };
  }
}

/** Every entry under `root` in the file system of the runtime, by path relative to it. */
export function listFolder(fs: RuntimeFs, root: string): FolderListing {
  const listing: FolderListing = new Map();
  const walk = (relative: string): void => {
    const absolute = relative ? `${root}/${relative}` : root;
    for (const name of fs.readdir(absolute)) {
      if (name === '.' || name === '..') continue;
      const path = relative ? `${relative}/${name}` : name;
      const stat = fs.stat(`${root}/${path}`);
      const isDir = fs.isDir(stat.mode);
      listing.set(path, { kind: isDir ? 'dir' : 'file', mtime: new Date(stat.mtime).getTime(), size: isDir ? 0 : stat.size });
      if (isDir) walk(path);
    }
  };
  walk('');
  return listing;
}
