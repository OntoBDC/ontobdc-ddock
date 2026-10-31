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
const METADATA_DIRECTORY = '.__ontobdc__';
const CONTAINER_METADATA_FILE = 'container.ttl';
const STORAGE_METADATA_FILE = 'storage.ttl';
const STORAGE_IDENTIFIER = 'urn:ontobdc:storage/local';
const INIT_ARGV: string[] = ['ontobdc', 'init', '--json'];
const LIST_ARGV: string[] = ['ontobdc', 'container', '--list', '--json'];
type RootRecord = { folder?: FileSystemDirectoryHandle; above?: boolean };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const objectOf = (document: string, predicate: string): string | null => {
  const match: RegExpMatchArray | null = document.match(
    new RegExp(`^\\s*${escapeRegExp(predicate)}\\s+(.+?)\\s*[;.]$`, 'm'),
  );
  return match?.[1]?.trim() ?? null;
};
const quoted = (value: string): string => JSON.stringify(value);
const storageGraphFromContainerMetadata = (metadata: string, containerName: string): string | null => {
  const subject: string | undefined = metadata.match(/^<([^>]+)>\s+a\s+\w+:DataContainer\s*;/m)?.[1];
  const identifier: string | null = objectOf(metadata, 'dcterms:identifier');
  const title: string | null = objectOf(metadata, 'dcterms:title');
  const created: string | null = objectOf(metadata, 'ct:creationDate');
  const description: string | null = objectOf(metadata, 'ct:description');
  if (!subject || !identifier || !title || !created || !description) return null;

  return [
    '@prefix ct: <http://standards.iso.org/iso/21597/-1/ed-1/en/Container#> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '@prefix obdc: <http://datacenter.app.br/ontology/tool/ontobdc/core/ns.ttl#> .',
    '@prefix prov: <http://www.w3.org/ns/prov#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '',
    `<${STORAGE_IDENTIFIER}> a obdc:DataStorage ;`,
    `    dcterms:identifier ${quoted(STORAGE_IDENTIFIER)} ;`,
    '    dcterms:title "The Main Storage Index"@en ;',
    `    ct:creationDate ${created} ;`,
    '    ct:description "Main storage container for the virtual browser root"@en ;',
    `    prov:atLocation <file://${ROOT_PATH}> .`,
    '',
    `<${subject}> a obdc:DataContainer ;`,
    `    dcterms:identifier ${identifier} ;`,
    `    dcterms:title ${title} ;`,
    `    ct:creationDate ${created} ;`,
    `    ct:description ${description} ;`,
    `    prov:atLocation <file://${ROOT_PATH}/${containerName}> .`,
    '',
  ].join('\n');
};

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
    const containers = await StorageRoot.listIn(await this.mount());
    return (containers ?? []).some((entry) => entry.location?.replace(/\/+$/, '').split('/').pop() === name);
  }

  /** Asks Python to run `ontobdc container --refresh` on the container called `name`, a folder of the root. */
  async refreshContainer(name: string): Promise<void> {
    const mount = await this.mount(true);
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
    const mount = await this.mount(true);
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
  async isOk(): Promise<boolean> {
    return StorageRoot.existsInPython(await this.mount());
  }

  /** Asks Python to run `ontobdc init` in the root. */
  async initialize(): Promise<void> {
    let init: PythonCommandResult;
    try {
      init = await runPythonCommand('container', INIT_ARGV, await this.mount());
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
    return this.rootRecord()?.folder;
  }

  /** Where the CLI sees the root: the folder picked, or else the place Python found it by itself. */
  async mount(includeVirtualRootMetadata = false): Promise<PythonMount> {
    const folder = this.folder();
    if (!folder) return { path: ROOT_PATH };
    const above = this.rootRecord()?.above;
    return above
      ? {
        path: `${ROOT_PATH}/${folder.name}`,
        cwd: ROOT_PATH,
        handle: folder,
        ...(includeVirtualRootMetadata ? { cwdFiles: await this.virtualRootMetadata(folder) } : {}),
      }
      : { path: `${ROOT_PATH}/${folder.name}`, handle: folder };
  }

  private rootRecord(): RootRecord | undefined {
    const record = this.context.etl.read(this.machine, this.context.requestId, ROOT_RECORD);
    return record?.result as RootRecord | undefined;
  }

  private async virtualRootMetadata(folder: FileSystemDirectoryHandle): Promise<Array<{ path: string; data: ArrayBuffer }>> {
    const metadata: string | null = await this.readContainerMetadata(folder);
    if (!metadata) return [];

    const storageIndex: string | null = storageGraphFromContainerMetadata(metadata, folder.name);
    if (!storageIndex) return [];

    const bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(storageIndex);
    return [{ path: `${METADATA_DIRECTORY}/${STORAGE_METADATA_FILE}`, data: bytes.buffer }];
  }

  private async readContainerMetadata(folder: FileSystemDirectoryHandle): Promise<string | null> {
    try {
      const metadataDirectory: FileSystemDirectoryHandle = await folder.getDirectoryHandle(METADATA_DIRECTORY);
      const metadataFile: FileSystemFileHandle = await metadataDirectory.getFileHandle(CONTAINER_METADATA_FILE);
      return await (await metadataFile.getFile()).text();
    } catch {
      return null;
    }
  }
}
