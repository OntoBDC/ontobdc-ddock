import { runPythonCommand } from '@/ontobdc/shared/adapter/command';
import { cliError } from '@/ontobdc/container/plugin/capability/transformation/storage';
import { parseCliResponse } from '@/ontobdc/shared/adapter/container-format';
import type { CapabilityContext } from '@/ontobdc/shared/domain/model/capability';
import type { PythonCommandResult, PythonMount } from '@/ontobdc/shared/domain/model/python-command';

/** The name the root of the workspace is kept under in the ETL: not a state, so no state depends on another. */
const ROOT_RECORD = 'storage_root';
/** The folder of the container the person picked, kept under the name of the state that picks it. */
const CONTAINER_RECORD = 'storage_container_defined';
/** Where Python itself looks for the root when no folder was mounted for it. */
const ROOT_PATH = '/storage';
const INIT_ARGV: string[] = ['ontobdc', 'init', '--json'];
const LIST_ARGV: string[] = ['ontobdc', 'container', '--list', '--json'];

/**
 * The root of the workspace, the way the states of a machine see it: how it came to be
 * defined, whether Python already had it or the person picked it, is not theirs to know.
 */
export class StorageRoot {
  constructor(private readonly context: Pick<CapabilityContext, 'etl' | 'requestId' | 'machine'>) {}

  private get machine(): string {
    if (!this.context.machine) throw new Error('The context of the capability carries no machine.');
    return this.context.machine;
  }

  /**
   * Whether Python already has a root of the workspace. It is asked with `ontobdc container --list`,
   * which answers with the containers of the storage when it finds the root and with an error when
   * it does not. A command that could not run is no answer.
   */
  static async existsInPython(mount: PythonMount = { path: ROOT_PATH }): Promise<boolean> {
    return (await StorageRoot.listIn(mount)) !== null;
  }

  /** The containers `ontobdc container --list` answers with, or null when there is no root or the command did not run. */
  private static async listIn(mount: PythonMount): Promise<Array<{ location?: string }> | null> {
    try {
      const listed = await runPythonCommand('container', LIST_ARGV, mount);
      const content = parseCliResponse<{ containers?: unknown; error?: string }>(listed.stdout)?.content;
      if (listed.code !== 0 || content?.error || !Array.isArray(content?.containers)) return null;
      return content.containers as Array<{ location?: string }>;
    } catch {
      return null;
    }
  }

  /** Whether the listing of the root has a container whose folder is called `name`. */
  async hasContainer(name: string): Promise<boolean> {
    const containers = await StorageRoot.listIn(this.mount());
    return (containers ?? []).some((entry) => entry.location?.replace(/\/+$/, '').split('/').pop() === name);
  }

  /** Asks Python to run `ontobdc container --refresh` on the container called `name`, a folder of the root. */
  async refreshContainer(name: string): Promise<void> {
    const mount = this.mount();
    let refreshed: PythonCommandResult;
    try {
      refreshed = await runPythonCommand('container', ['ontobdc', 'container', '--refresh', '--container', `${mount.cwd ?? mount.path}/${name}`, '--json'], mount);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
    }
    if (refreshed.code !== 0) throw new Error(cliError(refreshed));
  }

  /**
   * Asks Python to put the container in the root: `ontobdc container --attach` when the person
   * picked the folder of a container that already is on disk, `--create` when there is none yet.
   */
  async createContainer(name: string): Promise<void> {
    const mount = this.mount();
    const argv = this.containerFolder()
      ? ['ontobdc', 'container', '--attach', '--container', `${mount.cwd ?? mount.path}/${name}`, '--json']
      : ['ontobdc', 'container', '--create', name, '--json'];
    let done: PythonCommandResult;
    try {
      done = await runPythonCommand('container', argv, mount);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
    }
    if (done.code !== 0) throw new Error(cliError(done));
  }

  /** Whether Python finds a root of the workspace in the folder as it is mounted now. */
  isOk(): Promise<boolean> {
    return StorageRoot.existsInPython(this.mount());
  }

  /** Asks Python to run `ontobdc init` in the root. */
  async initialize(): Promise<void> {
    let init: PythonCommandResult;
    try {
      init = await runPythonCommand('container', INIT_ARGV, this.mount());
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
    }
    if (init.code !== 0) throw new Error(cliError(init));
  }

  /** Records the folder the person picked as the root. */
  define(folder: FileSystemDirectoryHandle): void {
    this.context.etl.write(this.machine, this.context.requestId, ROOT_RECORD, {
      phase: 'done',
      entity: { name: folder.name },
      result: { folder },
    });
  }

  /**
   * Records the folder the person picked as the one inside the root: the root is the directory
   * above it, which exists only in Python. What is written in the folder goes to disk; the root is not.
   */
  defineAbove(folder: FileSystemDirectoryHandle): void {
    this.context.etl.write(this.machine, this.context.requestId, ROOT_RECORD, {
      phase: 'done',
      entity: { name: folder.name },
      result: { folder, above: true },
    });
  }

  /** Records the folder of the container the person picked. */
  defineContainer(folder: FileSystemDirectoryHandle): void {
    this.context.etl.write(this.machine, this.context.requestId, CONTAINER_RECORD, {
      phase: 'done',
      entity: { name: folder.name },
      result: { folder },
    });
  }

  /** The folder of the container the person picked, if a state asked for it. */
  containerFolder(): FileSystemDirectoryHandle | undefined {
    const record = this.context.etl.read(this.machine, this.context.requestId, CONTAINER_RECORD);
    return (record?.result as { folder?: FileSystemDirectoryHandle } | undefined)?.folder;
  }

  /** The name of the container: the folder picked for it, or else the one the request was made with. */
  containerName(parameters: CapabilityContext['parameters']): string {
    return (this.containerFolder()?.name ?? parameters.name ?? '').trim();
  }

  /** The folder the person picked, if the root was defined by picking one. */
  folder(): FileSystemDirectoryHandle | undefined {
    const record = this.context.etl.read(this.machine, this.context.requestId, ROOT_RECORD);
    return (record?.result as { folder?: FileSystemDirectoryHandle } | undefined)?.folder;
  }

  /** Where the CLI sees the root: the folder picked, or else the place Python found it by itself. */
  mount(): PythonMount {
    const folder = this.folder();
    if (!folder) return { path: ROOT_PATH };
    const above = (this.context.etl.read(this.machine, this.context.requestId, ROOT_RECORD)?.result as { above?: boolean } | undefined)?.above;
    return above
      ? { path: `${ROOT_PATH}/${folder.name}`, cwd: ROOT_PATH, handle: folder }
      : { path: `${ROOT_PATH}/${folder.name}`, handle: folder };
  }
}
