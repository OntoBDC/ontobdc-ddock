/// <reference lib="webworker" />
import type { PyodideAPI } from 'pyodide';
import { MountSession, type RuntimeFs } from './python-mount';
import { commandForcesPull, commandWritesToMount } from './python-sync';
import type { PythonWorkerRequest, PythonWorkerResponse } from '@/ontobdc/shared/domain/model/python-message';

const pythonBase = new URL(`${import.meta.env.BASE_URL}python/`, self.location.origin).href;
let runtime: Promise<PyodideAPI> | null = null;
let queue: Promise<void> = Promise.resolve();

async function readFileList(file: string): Promise<string[]> {
  const url = `${pythonBase}${file}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${file}: HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`Unable to load ${url}: expected JSON, received ${response.headers.get('content-type') ?? 'no content type'}. Restart the server after regenerating the Python runtime.`);
  }
  const files: unknown = await response.json();
  if (!Array.isArray(files) || !files.every((entry) => typeof entry === 'string')) {
    throw new Error(`${file} must contain a list of strings.`);
  }
  return files;
}

/** Load only the vendored runtime and packages, without blocking the UI thread. */
async function startPython(): Promise<PyodideAPI> {
  const { loadPyodide } = await import(/* @vite-ignore */ `${pythonBase}pyodide/pyodide.mjs`) as typeof import('pyodide');
  const python = await loadPyodide({ indexURL: `${pythonBase}pyodide/` });
  await python.loadPackage(await readFileList('packages.json'));

  const wheelUrls = (await readFileList('wheels.json')).map((file) => `${pythonBase}wheels/${file}`);
  const wheels = python.toPy(wheelUrls);
  try {
    python.globals.set('WHEELS', wheels);
    await python.runPythonAsync('import micropip\nawait micropip.install(WHEELS, deps=False)');
  } finally {
    python.globals.delete('WHEELS');
    wheels.destroy();
  }

  const ontobdcVersion: unknown = await python.runPythonAsync('from importlib.metadata import version\nversion("ontobdc")');
  if (typeof ontobdcVersion !== 'string' || !ontobdcVersion.trim()) {
    throw new Error('The installed OntoBDC package has no version metadata.');
  }
  const message: PythonWorkerResponse = { type: 'ready', ontobdcVersion };
  self.postMessage(message);
  return python;
}

/** Capture each command separately, restoring interpreter state even on failure. */
const RUN_CLI = `
import os, sys, json, io, contextlib
previous_cwd, previous_argv = os.getcwd(), sys.argv
output, errors = io.StringIO(), io.StringIO()
exit_code = 0
try:
    os.chdir(CWD)
    sys.argv = list(ARGV)
    if sys.argv[0] == 'infobim':
        from infobim.cli import main
    else:
        from ontobdc.cli import main
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
        try:
            main()
        except SystemExit as result:
            exit_code = result.code if isinstance(result.code, int) else (0 if result.code is None else 1)
finally:
    os.chdir(previous_cwd)
    sys.argv = previous_argv
json.dumps({"code": exit_code, "stdout": output.getvalue(), "stderr": errors.getvalue()})
`;

/**
 * The commands that load most of what a command needs (the command modules, the graph library, the ontologies), run once
 * where nothing is kept, so that the first command of the person does not pay for loading them.
 */
const WARMUP_COMMANDS: string[][] = [
  ['infobim', 'project', '--list', '--json'],
  ['infobim', 'annotate', '--list', '--json'],
];
const WARMUP_DIRECTORY = '/tmp/warmup';

/** Runs the warm-up commands after the runtime starts, ahead of any command asked. What they answer is of no use, and what goes wrong in them is not told. */
async function warmUp(python: PyodideAPI): Promise<void> {
  python.FS.mkdirTree(WARMUP_DIRECTORY);
  try {
    for (const argv of WARMUP_COMMANDS) {
      const args = python.toPy(argv);
      python.globals.set('CWD', WARMUP_DIRECTORY);
      python.globals.set('ARGV', args);
      try {
        await python.runPythonAsync(RUN_CLI);
      } catch {
        // Nothing to warm in what failed.
      } finally {
        args.destroy();
        python.globals.delete('CWD');
        python.globals.delete('ARGV');
      }
    }
  } finally {
    await discardDirectory(python, WARMUP_DIRECTORY);
  }
}

/**
 * The folder of the container, kept in the runtime from one command to the next: it is read from disk
 * once, and then only what differs is carried in or out (see `MountSession`). One at a time; a command
 * for another folder replaces it.
 */
let session: MountSession | null = null;

/** Takes the folder out of the runtime, and empties the place it was in. */
async function endSession(python: PyodideAPI): Promise<void> {
  if (!session) return;
  const path = session.path;
  session = null;
  await discardDirectory(python, path);
}

async function run(request: Extract<PythonWorkerRequest, { type: 'run' }>): Promise<void> {
  const { requestId, argv, mount } = request;
  try {
    if (!runtime) throw new Error('Python has not been started by the layout.');
    const python = await runtime;
    if (!mount.path.startsWith('/') || mount.path === '/' || mount.path.split('/').some((part) => part === '..' || part === '.')) {
      throw new Error('The container mount must be an absolute directory path.');
    }
    const cwd = mount.cwd ?? mount.path;
    if (cwd !== mount.path && (cwd === '/' || !cwd.startsWith('/') || cwd.split('/').some((part) => part === '..' || part === '.') || !mount.path.startsWith(`${cwd}/`))) {
      throw new Error('The working directory must be a directory above the container mount.');
    }
    // The session is kept only for the same folder at the same place: any other command ends it first.
    if (session && !(mount.handle && await session.isFor(mount.path, mount.handle))) await endSession(python);
    if (cwd !== mount.path && virtualOwner !== mount.path) {
      // A working directory above the mount belongs to the container mounted in it: another one never inherits it.
      await discardDirectory(python, cwd);
      virtualOwner = mount.path;
    }
    const writesToMount = commandWritesToMount(argv);
    const args = python.toPy(argv);
    let result: { code: number; stdout: string; stderr: string };
    try {
      if (mount.handle) {
        if (!session) {
          python.FS.mkdirTree(mount.path);
          if ((python.FS.readdir(mount.path) as string[]).some((name) => name !== '.' && name !== '..')) {
            throw new Error('The registered container location conflicts with the runtime filesystem.');
          }
          session = new MountSession(mount.path, mount.handle, python.FS as unknown as RuntimeFs);
        }
        await session.refresh(commandForcesPull(argv));
      } else {
        python.FS.mkdirTree(mount.path);
        for (const file of mount.files ?? []) {
          if (file.path.startsWith('/') || file.path.split('/').includes('..')) throw new Error('Invalid metadata path.');
          const path = `${mount.path}/${file.path}`;
          python.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
          python.FS.writeFile(path, new Uint8Array(file.data));
        }
      }
      python.globals.set('CWD', cwd);
      python.globals.set('ARGV', args);
      result = JSON.parse(String(await python.runPythonAsync(RUN_CLI))) as {
        code: number; stdout: string; stderr: string;
      };
      if (writesToMount && session) await session.writeBack();
    } catch (error) {
      // What the runtime holds may no longer agree with the disk: the next command reads it again.
      await endSession(python);
      throw error;
    } finally {
      args.destroy();
      python.globals.delete('CWD');
      python.globals.delete('ARGV');
      if (!mount.handle) {
        // Discard copied metadata so another container never inherits stale files.
        await discardDirectory(python, mount.path);
      }
    }
    const message: PythonWorkerResponse = { type: 'result', requestId, ...result };
    self.postMessage(message);
  } catch (error) {
    const message: PythonWorkerResponse = {
      type: 'command-failed', requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
}

/** Looks up the feature ontology directly: no container mount, no CWD/argv. */
const RUN_FEATURE_MESSAGE = `
import json
from brasidatacenter.tool.adapter.feature_message import first_message
json.dumps({"text": first_message(IDENTIFIER, DEVICE, ENVIRONMENT, LANGUAGE, PARAMETERS)})
`;

async function runFeatureMessage(request: Extract<PythonWorkerRequest, { type: 'feature-message' }>): Promise<void> {
  const { requestId, identifier, device, environment, language, parameters } = request;
  try {
    if (!runtime) throw new Error('Python has not been started by the layout.');
    const python = await runtime;
    python.globals.set('IDENTIFIER', identifier);
    python.globals.set('DEVICE', device);
    python.globals.set('ENVIRONMENT', environment);
    python.globals.set('LANGUAGE', language);
    const pyParameters = python.toPy(parameters ?? {});
    python.globals.set('PARAMETERS', pyParameters);
    try {
      const result = JSON.parse(String(await python.runPythonAsync(RUN_FEATURE_MESSAGE))) as { text: string | null };
      const message: PythonWorkerResponse = { type: 'feature-message-result', requestId, text: result.text };
      self.postMessage(message);
    } finally {
      python.globals.delete('IDENTIFIER');
      python.globals.delete('DEVICE');
      python.globals.delete('ENVIRONMENT');
      python.globals.delete('LANGUAGE');
      python.globals.delete('PARAMETERS');
      pyParameters.destroy();
    }
  } catch (error) {
    const message: PythonWorkerResponse = {
      type: 'command-failed', requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
}

/** What the installer of the runtime (micropip, the `pip` of Pyodide) holds, for the packages asked about. */
const RUN_PACKAGE_VERSIONS = `
import json
import micropip
installed = micropip.list()
json.dumps({name: (installed[name].version if name in installed else None) for name in PACKAGES})
`;

async function runPackageVersions(request: Extract<PythonWorkerRequest, { type: 'package-versions' }>): Promise<void> {
  const { requestId, packages } = request;
  try {
    if (!runtime) throw new Error('Python has not been started by the layout.');
    const python = await runtime;
    const names = python.toPy(packages);
    python.globals.set('PACKAGES', names);
    try {
      const versions = JSON.parse(String(await python.runPythonAsync(RUN_PACKAGE_VERSIONS))) as Record<string, string | null>;
      const message: PythonWorkerResponse = { type: 'package-versions-result', requestId, versions };
      self.postMessage(message);
    } finally {
      python.globals.delete('PACKAGES');
      names.destroy();
    }
  } catch (error) {
    const message: PythonWorkerResponse = {
      type: 'command-failed', requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
}

/** The mount whose container owns the working directory above it, if a command used one. */
let virtualOwner: string | null = null;

/** Empties a directory of the runtime, and leaves it there. */
async function discardDirectory(py: PyodideAPI, path: string): Promise<void> {
  py.globals.set('DISCARD_PATH', path);
  try {
    await py.runPythonAsync('import shutil\nshutil.rmtree(DISCARD_PATH, ignore_errors=True)');
  } finally {
    py.globals.delete('DISCARD_PATH');
  }
}

self.onmessage = ({ data }: MessageEvent<PythonWorkerRequest>) => {
  if (data.type === 'start' && !runtime) {
    runtime = startPython();
    // Commands asked meanwhile wait their turn behind it.
    queue = queue.then(async () => {
      try {
        await warmUp(await runtime!);
      } catch {
        // The runtime failed to start: the commands say so.
      }
    });
    void runtime.catch((error: unknown) => {
      const message: PythonWorkerResponse = {
        type: 'failed', message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(message);
    });
  } else if (data.type === 'run') {
    // cwd, argv and mounts are shared by the interpreter: serialize commands.
    queue = queue.then(() => run(data));
  } else if (data.type === 'feature-message') {
    // Shares the same single interpreter, so it is serialized too.
    queue = queue.then(() => runFeatureMessage(data));
  } else if (data.type === 'package-versions') {
    queue = queue.then(() => runPackageVersions(data));
  } else if (data.type === 'invalidate') {
    // In line with the commands, so what it says holds from the next command on and not before.
    queue = queue.then(() => session?.invalidate(data.paths));
  }
};
