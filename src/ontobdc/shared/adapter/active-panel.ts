export type PanelKind = 'entity' | 'entity-new' | 'table' | 'tag' | 'other';

const PREFIXES: Array<[string, PanelKind]> = [
  ['entity:', 'entity'],
  ['entity-new:', 'entity-new'],
  ['table:', 'table'],
  ['tag:', 'tag'],
];

/** What a Dockview panel id stands for: its kind, and for an entity tab the global id of the entity. */
export function describePanel(id: string): { kind: PanelKind; entityId?: string } {
  for (const [prefix, kind] of PREFIXES) {
    if (!id.startsWith(prefix)) continue;
    return kind === 'entity' ? { kind, entityId: id.slice(prefix.length) } : { kind };
  }
  return { kind: 'other' };
}

let active: string | null = null;

/** Remembers which panel of the surface is active; the surface calls it before it says so. */
export function setActivePanel(id: string | null): void {
  active = id;
}

/** The global id of the entity whose tab is active, or null when the active tab is not an entity's. */
export function activeEntityId(): string | null {
  return active === null ? null : describePanel(active).entityId ?? null;
}
