import { parse } from 'yaml';
import source from '@/asset/config.yaml?raw';
import coreLogo from '@/asset/logo-system.png';

/** The name in the header of the shell: the plain part, the coloured one and its colour. */
export type Brand = {
  plain: string;
  colored: string;
  color: string;
};

/** The brand of the shell that owns this code, for the keys the config does not declare. */
const ontobdcBrand: Brand = { plain: 'Onto', colored: 'BDC', color: '#00c8e8' };

type ConfigDocument = Record<string, unknown>;

/** The config files of the addons; each one overrides only the keys it declares. */
const addonSources = import.meta.glob<string>('@/addon/*/asset/config.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The logos of the addons, so the one named by `override.addon` can replace the core logo. */
const addonLogos = import.meta.glob<string>('@/addon/*/asset/logo-system.png', {
  query: '?url',
  import: 'default',
  eager: true,
});

const isDocument = (value: unknown): value is ConfigDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const documentOf = (text: string): ConfigDocument => {
  const value: unknown = parse(text);
  return isDocument(value) ? value : {};
};

/** The keys of the override over the base, key by key; a key the override does not declare stays as it was. */
function overridden(base: ConfigDocument, override: ConfigDocument): ConfigDocument {
  const result: ConfigDocument = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isDocument(value) && isDocument(base[key]) ? overridden(base[key], value) : value;
  }
  return result;
}

let loaded: ConfigDocument | undefined;

/** The name of the addon that goes last, from the `override.addon` key of the core config. */
function activeAddon(document: ConfigDocument): string | undefined {
  const override = document['override'];
  const value = isDocument(override) ? override['addon'] : undefined;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new Error('The config has no addon name at "override.addon".');
  return value;
}

/** The names of the addons whose command rewriters run, from the `override.command` key of the core config: a list, or a single name. */
function commandAddons(document: ConfigDocument): string[] {
  const override = document['override'];
  const value = isDocument(override) ? override['command'] : undefined;
  if (value === undefined) return [];
  const names = Array.isArray(value) ? value : [value];
  if (names.some((name) => typeof name !== 'string' || !name.trim())) throw new Error('The config has no addon name at "override.command".');
  return names as string[];
}

/** Ascending file-path order, with the named addon moved to the end so it overrides every other source. */
function mergeOrder(paths: string[], active: string | undefined): string[] {
  const sorted = [...paths].sort();
  if (active === undefined) return sorted;
  const named = `/addon/${active}/asset/config.yaml`;
  const last = sorted.filter((path) => path.includes(named));
  if (last.length === 0) throw new Error(`The config asks for the addon "${active}", which has no asset/config.yaml.`);
  return [...sorted.filter((path) => !path.includes(named)), ...last];
}

/** The core config, and the addon it names to be merged last; both come from the core file, never from an addon. */
const core = documentOf(source);
const activeAddonName = activeAddon(core);
const commandAddonNames = commandAddons(core);

/** The core `asset/config.yaml`, with every addon's on top, in ascending file-path order and the named addon last. */
function config(): ConfigDocument {
  if (loaded === undefined) {
    let value = core;
    for (const path of mergeOrder(Object.keys(addonSources), activeAddonName)) {
      value = overridden(value, documentOf(addonSources[path]));
    }
    loaded = value;
  }
  return loaded;
}

function valueAt(path: string): unknown {
  let value: unknown = config();
  for (const key of path.split('.')) {
    value = isDocument(value) ? value[key] : undefined;
  }
  return value;
}

function brandAt(path: string, fallback: string): string {
  const value = valueAt(path);
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`The config has no text at "${path}".`);
  return value;
}

/** The values of `asset/config.yaml` with the addons' on top — the one named by `override.addon` last — asked by their dotted path: `server.url`. */
export class Config {
  /** The URL at the path; it has to be there and to be an absolute http or https address. */
  static url(path: string): string {
    const value = valueAt(path);
    if (typeof value !== 'string' || !value.trim()) throw new Error(`The config has no URL at "${path}".`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`The config has an invalid URL at "${path}".`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`The config URL at "${path}" is not http or https.`);
    return value;
  }

  /** The brand of `metadata.brand`; it falls back to the OntoBDC one, key by key. */
  static brand(): Brand {
    return {
      plain: brandAt('metadata.brand.plain', ontobdcBrand.plain),
      colored: brandAt('metadata.brand.colored', ontobdcBrand.colored),
      color: brandAt('metadata.brand.color', ontobdcBrand.color),
    };
  }

  /** The addons, in order, whose `plugin/command` rewriters change the commands before they run. */
  static commandAddons(): string[] {
    return [...commandAddonNames];
  }

  /** The URL of `asset/logo-system.png`: the addon's own, when the addon named by `override.addon` has one; the core one otherwise. */
  static logo(): string {
    if (activeAddonName === undefined) return coreLogo;
    const named = `/addon/${activeAddonName}/asset/logo-system.png`;
    const path = Object.keys(addonLogos).find((key) => key.includes(named));
    return path === undefined ? coreLogo : addonLogos[path];
  }
}
