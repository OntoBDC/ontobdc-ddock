import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';

// Run against the same vendored runtime dependencies and wheels as the worker.
const base = new URL('../public/python/', import.meta.url);
const python = await loadPyodide({ packageCacheDir: fileURLToPath(new URL('pyodide/', base)) });
await python.loadPackage(JSON.parse(await readFile(new URL('packages.json', base), 'utf8')));
for (const wheel of JSON.parse(await readFile(new URL('wheels.json', base), 'utf8'))) {
  const path = `/tmp/${wheel}`;
  python.FS.writeFile(path, await readFile(new URL(`wheels/${wheel}`, base)));
  python.globals.set('wheel_path', path);
  await python.runPythonAsync(`
import site, zipfile
with zipfile.ZipFile(wheel_path) as archive:
    archive.extractall(site.getsitepackages()[0])
`);
  python.FS.unlink(path);
}
python.globals.delete('wheel_path');
await python.runPythonAsync(await readFile(new URL('../tests/python/container-inspect.py', import.meta.url), 'utf8'));
