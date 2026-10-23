import type { PythonCommandResult, PythonMount } from '@/ontobdc/shared/domain/model/python-command';

/** What a command answered, without the request it answered: the same command on the same mount answers it again. */
export type CachedCommandResult = Omit<PythonCommandResult, 'requestId'>;

/**
 * The key under which a command is cached: everything that decides its answer.
 * The mount is part of it because the same words answer differently on another
 * container, and `cwd` too because a command above the mount sees more of it.
 */
export function commandCacheKey(argv: string[], mount: PythonMount): string {
  return hashOf(`${mount.path}\u0000${mount.cwd ?? ''}\u0000${argv.join('\u0000')}`);
}

/**
 * FNV-1a, over the whole command. Short and cheap, and not meant to hide
 * anything: two different commands sharing a key would only lose a cached
 * answer, and the next one would read the container again.
 */
function hashOf(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * What the commands that only read answered, by their key, so a repeated one is
 * answered without the interpreter. What a command that writes answers is not
 * kept: its answer is what it did, not how the container is. It knows no event
 * bus — whoever learns that the container changed clears it.
 */
export class CommandCache {
  private readonly answers = new Map<string, CachedCommandResult>();

  get(key: string): CachedCommandResult | undefined {
    return this.answers.get(key);
  }

  set(key: string, result: CachedCommandResult): void {
    this.answers.set(key, result);
  }

  clear(): void {
    this.answers.clear();
  }
}

/** The cache of the answers of the commands of the runtime. */
export const commandCache = new CommandCache();
