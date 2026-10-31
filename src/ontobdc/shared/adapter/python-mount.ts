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
  /**
   * A file of `size` bytes whose content is not in the runtime: `read` brings it from where it is when the runtime
   * asks for it (a position and a length), and what the runtime tries to write to it is refused. Without this the
   * session copies every file in.
   */
  lazyFile?(path: string, size: number, mtime: number, read: (position: number, length: number) => Uint8Array): void;
}

/**
 * Below this size a file is copied into the runtime: a small file is read in whole, often more than once, and costs
 * little to carry. From this size on, one that the runtime only reads is left on disk and read when it is opened.
 */
export const LAZY_MIN_BYTES = 256 * 1024;

/** The metadata of a container and of a dataset, and the data of a dataset, are read and written by the runtime: they are copied in. */
const METADATA_DIRECTORY = '.__ontobdc__';
const DATASET_MARKERS = [`${METADATA_DIRECTORY}/dataset.ttl`, `${METADATA_DIRECTORY}/nid.ttl`, 'linkset/datapackage.json'];

/** The directories (by path, '' for the folder itself) that are datasets, from the paths of what is in the folder. */
function datasetDirectories(paths: Iterable<string>): Set<string> {
  const found = new Set<string>();
  for (const path of paths) {
    const marker = DATASET_MARKERS.find((candidate) => path === candidate || path.endsWith(`/${candidate}`));
    if (marker) found.add(path.slice(0, Math.max(0, path.length - marker.length - 1)));
  }
  return found;
}

/** Reads `length` bytes of the file from `position`, in the worker, where the runtime asks synchronously. */
function readSlice(file: Blob, position: number, length: number): Uint8Array {
  const Reader = (globalThis as unknown as { FileReaderSync?: new () => { readAsArrayBuffer(blob: Blob): ArrayBuffer } }).FileReaderSync;
  if (!Reader) throw new Error('A file cannot be read from disk while the runtime asks for it: FileReaderSync is not there.');
  return new Uint8Array(new Reader().readAsArrayBuffer(file.slice(position, position + length)));
}

const CRATE_PATH = [METADATA_DIRECTORY, 'ro-crate-metadata.json'];

/** `2026-10-22T17:26:32.161759Z` as milliseconds: the crate keeps microseconds, the disk milliseconds. */
function crateTime(text: unknown): number | null {
  const match = typeof text === 'string' ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(text) : null;
  if (!match) return null;
  const millis = (match[2] ?? '').padEnd(3, '0').slice(0, 3);
  const time = Date.parse(`${match[1]}.${millis}${match[3]}`);
  return Number.isNaN(time) ? null : time;
}

/** What the crate of the container knows of the files that are live: their size and time, by path. */
export function indexOfCrate(text: string): Map<string, { size: number; mtime: number }> {
  const index = new Map<string, { size: number; mtime: number }>();
  let graph: unknown;
  try {
    graph = (JSON.parse(text) as { '@graph'?: unknown })['@graph'];
  } catch {
    return index;
  }
  if (!Array.isArray(graph)) return index;
  for (const node of graph as Array<{ fileHistory?: unknown }>) {
    if (!Array.isArray(node?.fileHistory)) continue;
    const last = new Map<string, { size: unknown; time: number | null; ended: boolean }>();
    for (const entry of node.fileHistory as Array<Record<string, unknown>>) {
      if (typeof entry?.relativePath !== 'string') continue;
      const time = crateTime(entry.timestamp);
      const before = last.get(entry.relativePath);
      if (before && time !== null && before.time !== null && time < before.time) continue;
      last.set(entry.relativePath, { size: entry.contentSize, time, ended: entry.missingSince !== undefined });
    }
    for (const [path, { size, time, ended }] of last) {
      if (!ended && time !== null && typeof size === 'number' && size >= 0) index.set(path, { size, mtime: time });
    }
  }
  return index;
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
  /** The files the last look found, by path: the ones to load are read from them, without asking the folder again. */
  private readonly found = new Map<string, File>();
  /** What the crate says of the files, for the look in progress; empty when it is not asked for. */
  private crate = new Map<string, { size: number; mtime: number }>();

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
        // Only a look that is asked for reads the files on disk; any other takes what the crate of the container says of them.
        await this.pull('', !force);
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

  /**
   * Carries into the copy what differs on disk, at `sub` and below it (the whole folder when empty). With
   * `metadataOnly`, a file the crate of the container knows is made from what the crate says of it, without
   * asking the disk for it: its content is not there to be read.
   */
  async pull(sub: string, metadataOnly = false): Promise<void> {
    const found = await this.look(sub, metadataOnly && sub === '');
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
    const datasets = datasetDirectories([...this.remote.keys(), ...found.keys()]);
    await inBatches(plan.load, async (path) => {
      this.fs.mkdirTree(`${this.path}/${dirname(path)}`);
      const entry = found.get(path);
      if (entry?.stub && this.fs.lazyFile) {
        this.drop(`${this.path}/${path}`);
        this.fs.lazyFile(`${this.path}/${path}`, entry.size, entry.mtime, () => { throw new Error('The content of the file was not read from disk.'); });
        this.fs.utime(`${this.path}/${path}`, entry.mtime, entry.mtime);
        return;
      }
      const file = this.found.get(path) ?? await (await this.fileHandle(path)).getFile();
      if (this.fs.lazyFile && file.size >= LAZY_MIN_BYTES && !this.copied(path, datasets)) {
        // The runtime only reads it: it stays on disk, and is read from there when it is opened.
        this.drop(`${this.path}/${path}`);
        this.fs.lazyFile(`${this.path}/${path}`, file.size, file.lastModified, (position, length) => readSlice(file, position, length));
      } else {
        // What stood there as a file kept on disk (or described by the crate) refuses to be written: it is made again.
        this.drop(`${this.path}/${path}`);
        this.fs.writeFile(`${this.path}/${path}`, new Uint8Array(await file.arrayBuffer()));
      }
      this.fs.utime(`${this.path}/${path}`, file.lastModified, file.lastModified);
    });
    this.found.clear();

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
  private async look(sub: string, fromCrate = false): Promise<FolderListing> {
    const found: FolderListing = new Map();
    this.found.clear();
    this.crate = fromCrate ? await this.readCrate() : new Map();
    if (sub === '') {
      const pending: Array<{ path: string; handle: FileSystemFileHandle }> = [];
      await this.walk(this.handle, '', found, pending);
      const datasets = datasetDirectories(pending.map(({ path }) => path));
      const stubbed = ({ path }: { path: string }): boolean => this.crate.has(path) && !this.copied(path, datasets);
      for (const item of pending.filter(stubbed)) {
        const known = this.crate.get(item.path)!;
        found.set(item.path, { kind: 'file', mtime: known.mtime, size: known.size, stub: true });
      }
      await inBatches(pending.filter((item) => !stubbed(item)), async ({ path, handle }) => {
        const file = await handle.getFile();
        found.set(path, { kind: 'file', mtime: file.lastModified, size: file.size });
        this.found.set(path, file);
      });
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
      this.found.set(sub, file);
      return found;
    } catch { /* not a file */ }
    try {
      const directory = await parent.getDirectoryHandle(name);
      found.set(sub, { kind: 'dir', mtime: 0, size: 0 });
      const pending: Array<{ path: string; handle: FileSystemFileHandle }> = [];
      await this.walk(directory, sub, found, pending);
      await inBatches(pending, async ({ path, handle }) => {
        const file = await handle.getFile();
        found.set(path, { kind: 'file', mtime: file.lastModified, size: file.size });
        this.found.set(path, file);
      });
    } catch { /* not there */ }
    return found;
  }

  /** What the crate of the container says of its files; nothing when there is no crate or it cannot be read. */
  private async readCrate(): Promise<Map<string, { size: number; mtime: number }>> {
    try {
      const directory = await directoryAt(this.handle, CRATE_PATH.slice(0, -1), false);
      const file = await (await directory.getFileHandle(CRATE_PATH[CRATE_PATH.length - 1])).getFile();
      return indexOfCrate(await file.text());
    } catch {
      return new Map();
    }
  }

  /** Lists what is in `directory`: the directories go in `into`, and the files wait in `files` to be asked for. */
  private async walk(directory: FileSystemDirectoryHandle, prefix: string, into: FolderListing, files: Array<{ path: string; handle: FileSystemFileHandle }>): Promise<void> {
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
    for (const { path, handle } of directories) await this.walk(handle, path, into, files);
  }

  /** Whether the runtime may change the file, or reads what it holds as a whole: the metadata, and the data of a dataset. */
  private copied(path: string, datasets: Set<string>): boolean {
    const segments = path.split('/');
    if (segments.includes(METADATA_DIRECTORY)) return true;
    return segments.slice(0, -1).some((_, index) => datasets.has(segments.slice(0, index + 1).join('/'))) || datasets.has('');
  }

  /** Takes the file out of the runtime when it is there, to be made again. */
  private drop(absolute: string): void {
    try { this.fs.unlink(absolute); } catch { /* it was not there */ }
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
