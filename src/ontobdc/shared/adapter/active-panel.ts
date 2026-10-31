export type PanelKind = 'entity' | 'entity-new' | 'table' | 'tag' | 'file' | 'other';

const PREFIXES: Array<[string, PanelKind]> = [
  ['entity:', 'entity'],
  ['entity-new:', 'entity-new'],
  ['table:', 'table'],
  ['tag:', 'tag'],
];

/**
 * What a Dockview panel id stands for: its kind, for an entity tab the global id of the entity, and for the tab of a
 * file its path in the container. The tab of a file is `<prefix>:<path>`, the prefix being the one of the panel that
 * shows it (`image`, `pdf`, `ifc`…): any id of that form that is not one of the above is the tab of a file.
 */
export function describePanel(id: string): { kind: PanelKind; entityId?: string; path?: string } {
  for (const [prefix, kind] of PREFIXES) {
    if (!id.startsWith(prefix)) continue;
    return kind === 'entity' ? { kind, entityId: id.slice(prefix.length) } : { kind };
  }
  const separator = id.indexOf(':');
  return separator > 0 ? { kind: 'file', path: id.slice(separator + 1) } : { kind: 'other' };
}

let active: string | null = null;

/** Remembers which panel of the surface is active; the surface calls it before it says so. */
export function setActivePanel(id: string | null): void {
  active = id;
}

/** The id of the active panel of the surface, null when there is none. */
export function activePanelId(): string | null {
  return active;
}

/** The global id of the entity whose tab is active, or null when the active tab is not an entity's. */
export function activeEntityId(): string | null {
  return active === null ? null : describePanel(active).entityId ?? null;
}
