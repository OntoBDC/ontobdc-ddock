/** Names and paths inside a container folder, which need no access to it. */

/** The parts of a path in the container, which must name something inside it. */
export function segmentsOf(path: string): string[] {
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) throw new Error(`The path ${path} is not valid.`);
  return segments;
}

/** A name that can be given to one entry: no path, nothing that stands for a place. */
export function isEntryName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !/[\\/]/.test(name);
}

/** The last part of a path in the container. */
export const entryName = (path: string): string => segmentsOf(path).at(-1) ?? path;
