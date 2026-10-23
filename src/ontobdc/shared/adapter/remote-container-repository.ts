import { AccessTokenRepository } from '@/ontobdc/shared/adapter/access-token';
import type { RemoteContainerEntry } from '@/ontobdc/shared/domain/model/remote-container';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The containers in the answer: the list itself, or what is in `containers`, or in `content.containers`. */
function containersOf(answer: unknown): unknown[] {
  if (Array.isArray(answer)) return answer;
  if (isRecord(answer)) {
    if (Array.isArray(answer.containers)) return answer.containers;
    if (isRecord(answer.content) && Array.isArray(answer.content.containers)) return answer.content.containers;
  }
  throw new Error('The server did not answer with a list of containers.');
}

/**
 * Reads from a remote server of containers. It makes the GET with the access token the
 * person logged in with, which is kept for the origin of the URL, and gives back the answer.
 */
export class RemoteContainerRepository {
  constructor(private readonly tokens: AccessTokenRepository = new AccessTokenRepository()) {}

  /** The JSON the server answers the GET of `url` with. */
  async get(url: URL): Promise<unknown> {
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('The URL of the server must use HTTPS.');
    }
    const token = this.tokens.get(url.href);
    if (!token) throw new Error('You are not logged in.');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'omit',
    });
    if (response.status === 401) throw new Error('Your login expired. Log in again.');
    if (!response.ok) throw new Error(`The server answered HTTP ${response.status}.`);
    return response.json();
  }

  /** The containers the server lists at `url`. */
  async list(url: URL): Promise<RemoteContainerEntry[]> {
    return containersOf(await this.get(url)).filter(isRecord).map((entry) => ({
      id: text(entry.id),
      title: text(entry.title),
      description: text(entry.description),
      location: text(entry.location),
    }));
  }
}
