import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { nameIn, type FacadeField } from '@/ontobdc/shared/adapter/facade-labels';
import { getLocale } from '@/ontobdc/shared/plugin/i18n';

/** The class of the entities of a container: a field whose facade of resources is of it holds the global id of one of them. */
export const DATA_ENTITY_IRI = 'http://datacenter.app.br/ontology/tool/ontobdc/core/ns.ttl#DataEntity';

/** Whether the field holds the global id of an entity of the container. */
export const isEntityReference = (field: FacadeField): boolean =>
  field.resource_facade?.resource_iri === DATA_ENTITY_IRI || (field.resource_facade?.entity_types?.length ?? 0) > 0;

/** The entity types a field of entities can point to; none when it can point to any. */
/** Whether the entity the field points to belongs to the entity of the facade: it is made for it, not chosen among the others. */
export const isOwned = (field: FacadeField): boolean => field.owned === true && isEntityReference(field);

export const entityTypesOf = (field: FacadeField): string[] => field.resource_facade?.entity_types ?? [];

/** What each entity type a field of entities can point to is called, in the language of the interface. */
export const entityTypeLabelsOf = (field: FacadeField): Record<string, string> =>
  Object.fromEntries(Object.entries(field.resource_facade?.entity_type_labels ?? {}).flatMap(([type, names]) => {
    const name = nameIn(names, getLocale());
    return name === undefined ? [] : [[type, name]];
  }));

/** The entities of one type, as the choice of a field of entities shows them. */
export type EntityChoiceSection = { type: string; items: Array<{ id: string; name: string }> };
/** The entities of one group of the container (a dataset), by their type when they have one. */
export type EntityChoiceGroup = { group: string; title: string; sections: EntityChoiceSection[] };

/** The groups of the container, by group and, inside it, by type, but the entity `except`; with `types`, only the groups that hold them. */
function groupsOf(
  except: string | undefined,
  types: string[],
  withOwned: boolean,
  excludedTypes: string[] = [],
): EntityChoiceGroup[] {
  return EntityRepository.getInstance().all()
    .filter((group) => {
      if (!withOwned && group.owned === true) return false;
      if (types.length === 0 && excludedTypes.length === 0) return true;
      return group.entityTypes.some((type) => !excludedTypes.includes(type) && (types.length === 0 || types.includes(type)));
    })
    .map((group) => {
      const sections = new Map<string, EntityChoiceSection>();
      for (const item of group.items) {
        if (item.id === except || excludedTypes.includes(item.type)) continue;
        const section = sections.get(item.type) ?? { type: item.type, items: [] };
        section.items.push({ id: item.id, name: item.name || item.id });
        sections.set(item.type, section);
      }
      return { group: group.id, title: group.title, sections: [...sections.values()] };
    });
}

/**
 * The entities of the container a field of that kind is chosen from, but the one that is being edited: by group
 * and, inside it, by type. A group with no entity is there too, to have one created in it. The entities that are made
 * for another entity (the framework of a work stream) are not here: they are not chosen among the others.
 */
export function entityChoiceGroups(
  except?: string,
  types: string[] = [],
  excludedTypes: string[] = [],
): EntityChoiceGroup[] {
  return groupsOf(except, types, false, excludedTypes);
}

/** The name each entity is shown by, by global id, as the labels of options are given. */
export function entityLabels(except?: string): Record<string, Record<string, string>> {
  const labels: Record<string, Record<string, string>> = {};
  // Every entity has a name, the owned ones too: what points to one is shown by it.
  for (const { sections } of groupsOf(except, [], true)) {
    for (const { items } of sections) for (const item of items) labels[item.id] = { en: item.name };
  }
  return labels;
}

/** Who asked for an entity to be created so that it is chosen in a field: the editor that waits for it. */
type Reference = { owner: string; field: string };
const waiting = new Map<string, Reference>();
/** Who asked for an entity of a type the container had no dataset for, by type: the group does not exist until it is made. */
const waitingTypes = new Map<string, Reference>();
const editors = new Map<string, (id: string, name: string) => void>();
const keyOf = (owner: string, field: string): string => `${owner}\u0000${field}`;

/** The tab where what `owner` is being edited is: the new entity (`new:<group>`) or the entity. */
export const panelOf = (owner: string): string => (owner.startsWith('new:') ? `entity-new:${owner.slice('new:'.length)}` : `entity:${owner}`);

/** Registers the editor of a field of entities, which takes the entity that is created for it. */
export function registerReferenceEditor(owner: string, field: string, take: (id: string, name: string) => void): void {
  editors.set(keyOf(owner, field), take);
}

/** Forgets the editors of what was edited, once its editing is over. */
export function forgetReferenceEditors(owner: string): void {
  const prefix = `${owner}\u0000`;
  for (const key of [...editors.keys()]) if (key.startsWith(prefix)) editors.delete(key);
  for (const [group, reference] of [...waiting]) if (reference.owner === owner) waiting.delete(group);
  for (const [type, reference] of [...waitingTypes]) if (reference.owner === owner) waitingTypes.delete(type);
}

/** Asks for a new entity in the group, to be chosen in the field of `owner` when it is created. */
export function requestNewEntityFor(owner: string, field: string, group: string): void {
  waiting.set(group, { owner, field });
  eventBus.publish('presentation.entity.new.requested', 'entity_reference_editor', { group });
}

/** Asks for a new entity of the type, to be chosen in the field of `owner` when it is created: the container gets its dataset if it had none. */
export function requestNewEntityForType(owner: string, field: string, entityType: string): void {
  waitingTypes.set(entityType, { owner, field });
  eventBus.publish('presentation.entity.new.requested', 'entity_reference_editor', { entityType });
}

/**
 * Gives the entity just created in the group (of the type) to the field that asked for it, in the group or in the type,
 * and returns the tab to go back to; nothing when no field asked for it, or the editor is gone.
 */
export function deliverCreated(group: string, id: string, name: string, type: string): string | null {
  const reference = waiting.get(group) ?? waitingTypes.get(type);
  waiting.delete(group);
  waitingTypes.delete(type);
  const take = reference ? editors.get(keyOf(reference.owner, reference.field)) : undefined;
  if (!reference || !take) return null;
  take(id, name);
  return panelOf(reference.owner);
}

// A new entity whose tab is closed without being saved is not waited for.
eventBus.subscribe('presentation.main.panel.closed', ({ payload }) => {
  const id = payload?.id ?? '';
  if (!id.startsWith('entity-new:')) return;
  const group = id.slice('entity-new:'.length);
  waiting.delete(group);
  const type = EntityRepository.getInstance().findGroup(group)?.entityTypes[0];
  if (type) waitingTypes.delete(type);
});
