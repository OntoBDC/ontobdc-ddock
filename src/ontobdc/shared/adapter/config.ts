import { parse } from 'yaml';
import source from '@/asset/config.yaml?raw';

let loaded: unknown;

/** The addresses of `asset/config.yaml`, asked by their dotted path: `server.url`. */
export class Config {
  /** The URL at the path; it has to be there and to be an absolute http or https address. */
  static url(path: string): string {
    loaded ??= parse(source);
    let value: unknown = loaded;
    for (const key of path.split('.')) {
      value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
    }
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
}
