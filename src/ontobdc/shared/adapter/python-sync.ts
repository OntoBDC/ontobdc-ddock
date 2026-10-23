/** One entry of the mounted folder, by its path relative to the mount. */
export type FolderEntry = { kind: 'file' | 'dir'; mtime: number; size: number };

/** The mounted folder's entries, by path relative to the mount (`a/b.txt`). */
export type FolderListing = Map<string, FolderEntry>;

/**
 * What a command changed in the mounted folder, to apply to the folder on
 * disk in this order: `remove`, `createDirs`, `writeFiles` (removing first
 * lets an entry that turned from a file into a directory, or back, be recreated).
 */
export type SyncPlan = {
  /** Directories the command created, parents first. */
  createDirs: string[];
  /** Files the command created or changed. */
  writeFiles: string[];
  /** Entries the command removed, children first. */
  remove: string[];
};

const depth = (path: string): number => path.split('/').length;

/**
 * Compares the mounted folder as it was when it was mounted with how the
 * command left it. Only what the command did is carried back to disk: what
 * it created or changed, and what it removed among the entries that were
 * there at mount time. Anything that appeared on disk while the command ran
 * (written by the app or by the user) is in neither listing, so it is left
 * alone — unlike Pyodide's `syncfs()`, which mirrors the mount and deletes it.
 */
export function planSync(atMount: FolderListing, afterCommand: FolderListing): SyncPlan {
  const createDirs: string[] = [];
  const writeFiles: string[] = [];
  const remove: string[] = [];

  for (const [path, entry] of afterCommand) {
    const before = atMount.get(path);
    if (entry.kind === 'dir') {
      if (before?.kind !== 'dir') createDirs.push(path);
    } else if (before?.kind !== 'file' || before.mtime !== entry.mtime || before.size !== entry.size) {
      writeFiles.push(path);
    }
  }
  for (const [path, entry] of atMount) {
    if (afterCommand.get(path)?.kind !== entry.kind) remove.push(path);
  }

  createDirs.sort((a, b) => depth(a) - depth(b));
  remove.sort((a, b) => depth(b) - depth(a));
  return { createDirs, writeFiles, remove };
}

/** What differs on disk from how it was last seen, to carry into the copy in this order: `remove`, `createDirs`, `load`. */
export type PullPlan = {
  /** Entries gone from disk (or turned into another kind), children first. */
  remove: string[];
  /** Directories new on disk, parents first. */
  createDirs: string[];
  /** Files new on disk or changed there. */
  load: string[];
};

/**
 * Compares the folder on disk as it was last seen with how it is now. Only what changed on disk is in the
 * plan: what the runtime holds that disk never had is in neither listing, so it is left alone.
 */
export function planPull(seen: FolderListing, found: FolderListing): PullPlan {
  const remove: string[] = [];
  const createDirs: string[] = [];
  const load: string[] = [];

  for (const [path, entry] of seen) {
    if (found.get(path)?.kind !== entry.kind) remove.push(path);
  }
  for (const [path, entry] of found) {
    const before = seen.get(path);
    if (entry.kind === 'dir') {
      if (before?.kind !== 'dir') createDirs.push(path);
    } else if (before?.kind !== 'file' || before.mtime !== entry.mtime || before.size !== entry.size) {
      load.push(path);
    }
  }

  createDirs.sort((a, b) => depth(a) - depth(b));
  remove.sort((a, b) => depth(b) - depth(a));
  return { remove, createDirs, load };
}

const READ_ONLY_FLAGS = new Set<string>(['--inspect', '--list', '--read', '--tree']);
const MUTATING_FLAGS = new Set<string>(['--attach', '--create', '--dataset', '--delete', '--reconcile', '--refresh', '--update']);

/**
 * Read-only commands do not need a filesystem diff or write-back after they run. A command that
 * names an entity is one of them unless it says it writes: `--dataset` makes the dataset of the entity.
 */
export function commandWritesToMount(argv: string[]): boolean {
  if (argv[0] !== 'ontobdc') return true;
  if (argv.some((argument) => MUTATING_FLAGS.has(argument))) return true;
  if (argv[1] === 'container' && argv.includes('--entity')) return false;
  return !argv.some((argument) => READ_ONLY_FLAGS.has(argument));
}

/** A command that asks to look at the folder again: whatever changed on disk must be in the copy it works on. */
export function commandForcesPull(argv: string[]): boolean {
  return argv[0] === 'ontobdc' && argv.includes('--refresh');
}
